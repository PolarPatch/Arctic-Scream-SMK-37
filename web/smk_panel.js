// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 PolarPatch
// Arctic Scream SMK-37 in the browser: the keyboard's panel (37 keys, 16 pads, 8 knobs, 4 faders, the wheels, 18
// buttons) on the same worklet as the FM-1's page (worklet.js, arctic-smk37.wasm: firmware/src/arctic.c with
// BOARD_SMK37, web/fm1_web.c's fake keyboard). The protocol is panel.js's (keys, buttons, enc, master, frames back), with
// "smk" for what the FM-1 has not (web_smk: faders, the mod wheel, pads, the outer keys, the extra buttons).

const $ = (id) => document.getElementById(id);
const make = (tag, cls, parent, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent.appendChild(e);
  return e;
};
let node = null, master = 700, btnMask = 0, keyMask = 0;
const send = (m) => { if (node) node.port.postMessage(m); };
const STORE = "arctic-smk37-settings";
const stored = (k) => localStorage.getItem(k) ?? localStorage.getItem(k.replace("arctic", "grimm"));   // (the older pages' key)

// the SMK-37's buttons as printed, and what each is in Arctic Scream: an FM-1 button id (platform.c BTN_*) or an extra
// (14 KNOB BANK, 15 FADER BANK, 16 <, 17 >: web_smk kind 4)
const BUTTONS = [
  ["KNOB BANK", 14, ""], ["FADER BANK", 15, "BANK"], ["<", 16, ""], [">", 17, ""],
  ["OCTAVE-", 0, "OCT-"], ["OCTAVE+", 1, "OCT+"], ["PATCH", 8, "HOME"], ["BT", 9, "SAVE"], ["PARA", 6, "EDIT"],
  ["CHORD", 4, "ENV"], ["NOTE REPEAT", 5, "LFO"], ["SCALE", 3, "SEL"], ["GLOBE", 7, "GLO"], ["FX", 2, "FX"],
  ["ARP", 10, "ARP"], ["SEQ", 11, "SEQ"], ["SEQ PLAY", 12, "PLAY"], ["SEQ REC", 13, "REC"],
];
// K1..K8: K1 the MASTER (a pot here), the rest the FM-1's encoders (platform.c ENC_*)
const KNOBS = [["K1", "MASTER", -1], ["K2", "SELECT", 0], ["K3", "ALGORITHM", 1], ["K4", "PRESETS", 6],
               ["K5", "KNOB 1", 2], ["K6", "KNOB 2", 3], ["K7", "KNOB 3", 4], ["K8", "KNOB 4", 5]];
const FADER_BANKS = ["A: T1 · T2 · T3 · T4 LEVEL", "B: DELAY · SPACE · GRAIN · SHIMMER", "C: SWELL · CUTOFF · DRIVE · SIZE"];
const NOTE = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
const isBlack = (k) => [1, 3, 6, 8, 10].includes(k % 12);

// ------------------------------------------------------------------ the panel
const panel = $("smk");
const topRow = make("div", "top", panel), bottom = make("div", "bottom", panel);
const wheels = make("div", "wheels", topRow);
const screenBox = make("div", "screenbox", topRow);
const canvas = make("canvas", "", screenBox);
canvas.width = canvas.height = 240;
canvas.setAttribute("role", "img");
canvas.setAttribute("aria-label", "The screen");
make("div", "brand", screenBox).innerHTML = "Arctic scream<i>·</i><span>SMK-37</span>";
const knobBox = make("div", "knobs", topRow);
const faderBox = make("div", "faders", topRow);
const btnBox = make("div", "buttons", bottom);
const padBox = make("div", "pads", bottom);
const keybed = make("div", "keybed", panel);

// wheels: PITCH (springs back; Arctic Scream does not bend yet) and MOD (stays: SWELL)
function wheel(name, spring, onv) {
  const w = make("div", "wheel", wheels), track = make("div", "wtrack", w), cap = make("div", "wcap", track);
  make("div", "label", w, name);
  let v = spring ? 64 : 0;
  const draw = () => { cap.style.bottom = `${v / 127 * 82}%`; };
  draw();
  track.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    track.setPointerCapture(e.pointerId);
    const move = (ev) => {
      const r = track.getBoundingClientRect();
      v = Math.round(Math.max(0, Math.min(1, (r.bottom - ev.clientY) / r.height)) * 127);
      draw();
      onv(v);
    };
    move(e);
    track.onpointermove = move;
    track.onpointerup = track.onpointercancel = () => {
      track.onpointermove = null;
      if (spring) { v = 64; draw(); onv(v); }
    };
  });
  w.title = spring ? "PITCH: the selected track bent, ±2 semitones" : "MOD: SWELL, as CC 1";
}
wheel("PITCH", true, (v) => send({ type: "smk", k: 6, a: 0, b: v }));
wheel("MOD", false, (v) => send({ type: "smk", k: 1, a: 0, b: v }));

// knobs
const knobs = [];
for (const [print, name, enc] of KNOBS) {
  const k = { print, name, enc, angle: enc < 0 ? -135 + 270 * master / 1023 : 0 };
  const box = make("div", "knob", knobBox);
  make("div", "label", box, print);
  k.dial = make("div", "dial", box);
  k.dial.tabIndex = 0;
  k.dial.setAttribute("role", "slider");
  k.dial.setAttribute("aria-label", `${print}: ${name}`);
  k.dial.title = `${print}: ${name}`;
  make("div", "sub", box, name);
  knobs.push(k);
  bindKnob(k);
  drawKnob(k);
}
function drawKnob(k) { k.dial.style.setProperty("--a", `${k.angle}deg`); }
function turn(k, n) {
  if (!n) return;
  if (k.enc < 0) {
    master = Math.max(0, Math.min(1023, master + n * 24));
    k.angle = -135 + 270 * master / 1023;
    send({ type: "master", value: master });
  } else {
    k.angle = (k.angle + n * 18) % 360;
    send({ type: "enc", enc: k.enc, n });
  }
  drawKnob(k);
}
function bindKnob(k) {
  let drag = null, acc = 0;
  k.dial.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    k.dial.setPointerCapture(e.pointerId);
    k.dial.focus();
    drag = { y: e.clientY, acc: 0 };
  });
  k.dial.addEventListener("pointermove", (e) => {
    if (!drag) return;
    drag.acc += drag.y - e.clientY;
    drag.y = e.clientY;
    const n = Math.trunc(drag.acc / 8);
    if (n) { drag.acc -= n * 8; turn(k, n); }
  });
  for (const t of ["pointerup", "pointercancel"]) k.dial.addEventListener(t, () => { drag = null; });
  k.dial.addEventListener("wheel", (e) => {
    e.preventDefault();
    const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
    if (Math.abs(dy) >= 50) { turn(k, dy < 0 ? 1 : -1); acc = 0; return; }
    acc -= dy;
    const n = Math.trunc(acc / 25);
    if (n) { acc -= n * 25; turn(k, n); }
  }, { passive: false });
  k.dial.addEventListener("keydown", (e) => {
    const d = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[e.key];
    if (d) { turn(k, d); e.preventDefault(); e.stopPropagation(); }
  });
}

// faders: 0..127, sent as the keyboard's would read them
const bankOut = make("div", "bankname", faderBox, FADER_BANKS[0]);
const fRow = make("div", "frow", faderBox);
for (let f = 0; f < 4; f++) {
  const box = make("div", "fader", fRow), track = make("div", "ftrack", box), cap = make("div", "fcap", track);
  make("div", "label", box, `F${f + 1}`);
  let v = 0;
  const draw = () => { cap.style.bottom = `${v / 127 * 86}%`; };
  draw();
  track.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    track.setPointerCapture(e.pointerId);
    const move = (ev) => {
      const r = track.getBoundingClientRect();
      const nv = Math.round(Math.max(0, Math.min(1, (r.bottom - ev.clientY) / r.height)) * 127);
      if (nv !== v) { v = nv; draw(); send({ type: "smk", k: 0, a: f, b: v }); }
    };
    move(e);
    track.onpointermove = move;
    track.onpointerup = track.onpointercancel = () => { track.onpointermove = null; };
  });
}
let bank = 0;

// buttons
const buttons = [];
const btnHeld = new Map();
for (const [print, id, fn] of BUTTONS) {
  const b = make("button", id >= 14 ? "btn x" : "btn", btnBox);
  b.type = "button";
  b.innerHTML = `${print}${fn && fn !== print ? `<small>${fn}</small>` : ""}`;
  b.title = id >= 14 ? print : `${print}: ${fn}`;
  buttons.push({ el: b, id });
  b.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (id === 14) {                                       // KNOB BANK: held, the pads pick (slots, seasons)
      b.setPointerCapture(e.pointerId);
      send({ type: "smk", k: 5, a: 14, b: 1 });
      b.classList.add("held");
      const up = () => { send({ type: "smk", k: 5, a: 14, b: 0 }); b.classList.remove("held"); b.onpointerup = b.onpointercancel = null; };
      b.onpointerup = b.onpointercancel = up;
      return;
    }
    if (id >= 14) {
      send({ type: "smk", k: 4, a: id, b: 0 });
      if (id === 15) bankOut.textContent = FADER_BANKS[bank = (bank + 1) % 3];
      b.classList.add("held");
      setTimeout(() => b.classList.remove("held"), 120);
      return;
    }
    b.setPointerCapture(e.pointerId);
    btnHeld.set("p" + e.pointerId, id);
    syncButtons();
  });
  b.addEventListener("contextmenu", (e) => e.preventDefault());
}
function syncButtons() {
  let m = 0;
  for (const id of btnHeld.values()) m |= 1 << id;
  if (m !== btnMask) { btnMask = m; send({ type: "buttons", mask: m }); }
  for (const b of buttons) if (b.id < 14) b.el.classList.toggle("held", !!(m & (1 << b.id)));
}

// pads: 0..7 the top row, 8..15 the bottom (the hardware's numbers); the pressure from how high on the pad it is held.
// What they do (smk.c): the tracks, the slots, the FX layer's tricks held (KNOB BANK held: mutes, saves, the seasons)
const PAD_NAME = ["T1", "T2", "T3", "T4", "A", "B", "C", "D", "REV", "ECHO", "TAPE", "BACK", "LOW", "HIGH", "STUT", "SWELL"];
const PAD_TITLE = ["T1 (again: LATCH)", "T2 (again: LATCH)", "T3 (again: LATCH)", "T4 (again: LATCH)", "slot A", "slot B", "slot C",
  "slot D", "REV THROW", "ECHO THROW", "TAPE STOP", "REVERSE", "FILTER DOWN", "FILTER UP", "STUTTER", "SWELL"];
const pads = [];
for (let p = 0; p < 16; p++) {
  const el = make("div", "pad", padBox);
  make("span", "plab", el, PAD_NAME[p]);
  el.title = PAD_TITLE[p];
  el.setAttribute("role", "button");
  el.setAttribute("aria-label", `Pad ${p + 1}: ${PAD_TITLE[p]}`);
  pads.push(el);
  el.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    const press = (ev) => {
      const r = el.getBoundingClientRect();
      return Math.max(20, Math.round((1 - (ev.clientY - r.top) / r.height) * 127));
    };
    send({ type: "smk", k: 2, a: p, b: press(e) });
    el.classList.add("held");
    el.onpointermove = (ev) => send({ type: "smk", k: 2, a: p, b: press(ev) });
    el.onpointerup = el.onpointercancel = () => {
      el.onpointermove = null;
      el.classList.remove("held");
      send({ type: "smk", k: 2, a: p, b: 0 });
    };
  });
}

// the keybed: C3..C6, key k 0..36; 5..31 (F3..G5) are the FM-1's 27 keys, the rest the outer ones (web_smk kind 3)
const keys = [];
const keyHeld = new Map();
{
  const whites = [];
  for (let k = 0; k < 37; k++) if (!isBlack(k)) whites.push(k);
  const ww = 100 / whites.length;
  for (let k = 0; k < 37; k++) {
    const black = isBlack(k), wi = whites.indexOf(black ? k - 1 : k);
    const el = make("div", black ? "key black" : "key", keybed);
    el.style.left = `${black ? (wi + 1) * ww - ww * 0.3 : wi * ww}%`;
    el.style.width = `${black ? ww * 0.6 : ww}%`;
    if (k < 5 || k > 31) el.classList.add("outer");
    el.title = NOTE[k % 12] + (3 + Math.floor(k / 12)) + (k < 5 || k > 31 ? " (an outer key: the selected track)" : "");
    keys[k] = el;
    el.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      keyHeld.set("p" + e.pointerId, k);
      syncKeys();
    });
  }
}
let outerDown = 0n;
function syncKeys() {
  let m = 0, outer = 0n;
  for (const k of keyHeld.values()) {
    if (k >= 5 && k <= 31) m |= 1 << (k - 5);
    else outer |= 1n << BigInt(k);
  }
  if (m !== keyMask) { keyMask = m; send({ type: "keys", mask: m }); }
  for (let k = 0; k < 37; k++) {
    const bit = 1n << BigInt(k), was = !!(outerDown & bit), now = !!(outer & bit);
    if (was !== now) send({ type: "smk", k: 3, a: k, b: now ? 100 : 0 });
  }
  outerDown = outer;
  keys.forEach((el, k) => el.classList.toggle("held", [...keyHeld.values()].includes(k)));
}
function release(e) {
  const id = "p" + e.pointerId;
  if (btnHeld.delete(id)) syncButtons();
  if (keyHeld.delete(id)) syncKeys();
}
for (const t of ["pointerup", "pointercancel", "lostpointercapture"]) panel.addEventListener(t, release);

// the computer keyboard: F3..E4 on the Z row (white) and A row (black), F4.. on Q..; the arrows SELECT and ALGORITHM
const KEYMAP = {};
["KeyZ", "KeyX", "KeyC", "KeyV", "KeyB", "KeyN", "KeyM", "Comma", "Period", "Slash"].forEach((c, i) => KEYMAP[c] = [5, 7, 9, 11, 12, 14, 16, 17, 19, 21][i]);
[["KeyS", 6], ["KeyD", 8], ["KeyF", 10], ["KeyH", 13], ["KeyJ", 15], ["KeyL", 18], ["Semicolon", 20]].forEach(([c, k]) => KEYMAP[c] = k);
["KeyQ", "KeyW", "KeyE", "KeyR", "KeyT", "KeyY", "KeyU", "KeyI", "KeyO"].forEach((c, i) => KEYMAP[c] = 23 + i);
const ARROWS = { ArrowUp: [1, 1], ArrowDown: [1, -1], ArrowRight: [2, 1], ArrowLeft: [2, -1] };
addEventListener("keydown", (e) => {
  if (!node || e.metaKey || e.ctrlKey || e.altKey) return;
  if (ARROWS[e.code]) { const [i, d] = ARROWS[e.code]; turn(knobs[i], d); e.preventDefault(); return; }
  const k = KEYMAP[e.code];
  if (k === undefined) return;
  e.preventDefault();
  if (!e.repeat) { keyHeld.set("k" + e.code, k); syncKeys(); }
});
addEventListener("keyup", (e) => { if (keyHeld.delete("k" + e.code)) syncKeys(); });
addEventListener("blur", () => {
  for (const id of [...keyHeld.keys()]) if (id[0] !== "p") keyHeld.delete(id);
  syncKeys();
});

// ------------------------------------------------------------------ the screen and the lights
const ctx = canvas.getContext("2d");
const img = ctx.createImageData(240, 240);
function drawScreen(fb) {
  const d = img.data;
  for (let i = 0; i < 240 * 240; i++) {
    const p = fb[i];
    d[i * 4] = ((p >> 11) & 31) * 255 / 31;
    d[i * 4 + 1] = ((p >> 5) & 63) * 255 / 63;
    d[i * 4 + 2] = (p & 31) * 255 / 31;
    d[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}
function drawLights([litB]) { for (const b of buttons) if (b.id < 14) b.el.classList.toggle("lit", !!(litB & (1 << b.id))); }
function drawPads(v) {
  pads.forEach((el, p) => {
    const c = v[p] >>> 0, r = c >> 16 & 255, g = c >> 8 & 255, b = c & 255;
    const lift = (x) => Math.min(255, Math.round(x * 1.6 + 18));   // (a screen is not an LED: the dim glow lifted)
    el.style.setProperty("--pad", `rgb(${lift(r)}, ${lift(g)}, ${lift(b)})`);
    el.classList.toggle("on", r + g + b > 120);
  });
  for (const b of buttons) if (b.id >= 14) b.el.classList.toggle("lit", !!(v[16] & (1 << (b.id - 14))));
}

// ------------------------------------------------------------------ the settings, kept in this browser
function loadSettings() {
  try {
    const a = JSON.parse(stored(STORE) || "null");
    return Array.isArray(a) ? Uint8Array.from(a.slice(0, 256)) : null;
  } catch { return null; }
}
function saveSettings(u8) { try { localStorage.setItem(STORE, JSON.stringify([...u8])); } catch { /* (until the page closes) */ } }

// ------------------------------------------------------------------ switching on
async function switchOn() {
  const go = $("go"), err = $("error");
  go.disabled = true;
  go.textContent = "Starting…";
  err.hidden = true;
  try {
    const ac = new AudioContext({ sampleRate: 44100, latencyHint: "interactive" });
    const [wasm] = await Promise.all([
      fetch("arctic-smk37.wasm").then((r) => { if (!r.ok) throw new Error(`arctic-smk37.wasm: ${r.status}`); return r.arrayBuffer(); }),
      ac.audioWorklet.addModule("worklet.js")]);
    node = new AudioWorkletNode(ac, "arctic", { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
    node.connect(ac.destination);
    await new Promise((res, rej) => {
      node.port.onmessage = (e) => {
        const m = e.data;
        if (m.type === "ready") res();
        else if (m.type === "error") rej(new Error(m.message));
        else if (m.type === "frame") {
          if (m.fb) drawScreen(m.fb);
          if (m.leds) drawLights(m.leds);
          if (m.pads) drawPads(m.pads);
          if (m.settings) saveSettings(m.settings);
        }
      };
      const settings = loadSettings();
      node.port.postMessage({ type: "load", wasm, settings: settings && settings.buffer, master }, [wasm]);
    });
    await ac.resume();
    $("start").hidden = true;
    syncButtons();
    syncKeys();
  } catch (e) {
    node = null;
    go.disabled = false;
    go.textContent = "Switch on";
    err.textContent = "Could not start: " + ((e && e.message) || e) + ". A current Chrome, Edge, Firefox or Safari should work.";
    err.hidden = false;
  }
}
$("go").addEventListener("click", switchOn);
