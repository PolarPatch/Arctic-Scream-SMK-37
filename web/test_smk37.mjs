// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 PolarPatch
// (Arctic Scream SMK-37) the browser build for the SMK-37 (web/dist/grimm-smk37.wasm) driven as smk_panel.js drives it:
// a pad, an outer key, a fader past its value, FADER BANK, the mod wheel; it sounds, and the pads light.
//   node web/test_smk37.mjs   (after web/build_web.sh)
import { readFileSync } from "node:fs";

let ex, data, size, started = false, rewinding = false;
const { instance } = await WebAssembly.instantiate(readFileSync("web/dist/grimm-smk37.wasm"), {
  env: {
    web_yield() {
      if (rewinding) { ex.asyncify_stop_rewind(); rewinding = false; return; }
      const h = new Int32Array(ex.memory.buffer, data, 2);
      h[0] = data + 8;
      h[1] = data + size;
      ex.asyncify_start_unwind(data);
    },
    web_ticks: () => (performance.now() * 24000) >>> 0,
  },
});
ex = instance.exports;
ex._initialize?.();
data = ex.web_async_buf();
size = ex.web_async_size();
function run() {
  if (started) { rewinding = true; ex.asyncify_start_rewind(data); }
  started = true;
  ex.web_run();
  if (ex.asyncify_get_state() === 1) ex.asyncify_stop_unwind();
}
const SCRIPT = [[3000, 2, 8, 100], [3500, 2, 8, 0], [4000, 3, 0, 100], [4500, 3, 0, 0],
                [5000, 0, 0, 40], [5200, 0, 0, 110], [5400, 0, 0, 120], [6000, 4, 15, 0], [6500, 1, 0, 127]];
ex.web_master(1023);
ex.web_want_frames(0);
let step = 0, fail = 0, sum = [0, 0], pads = null, padsOn = null, xled = 0;
const check = (name, ok, info = "") => { console.log(`  ${ok ? "ok  " : "FAIL"}  smk37 web: ${name}${ok ? "" : "  " + info}`); if (!ok) fail++; };
for (;;) {
  run();
  const ms = ex.web_now_ms();
  while (step < SCRIPT.length && SCRIPT[step][0] <= ms) { const [, k, a, b] = SCRIPT[step++]; ex.web_smk(k, a, b); }
  const n = ex.web_avail();
  if (n) {
    ex.web_want_frames(Math.min(n, 1024));
    ex.web_take();
    const l = new Float32Array(ex.memory.buffer, ex.web_out_l(), Math.min(n, 1024));
    for (const v of l) sum[ms >= 3000 && ms < 7000 ? 1 : 0] += v * v;
    ex.web_want_frames(0);
  }
  if (ms === 3300) padsOn = Array.from(new Uint32Array(ex.memory.buffer, ex.web_pad_rgb(), 16));
  if (ms === 2500) pads = Array.from(new Uint32Array(ex.memory.buffer, ex.web_pad_rgb(), 16));
  if (ms === 6200) xled = ex.web_xled();
  if (ms >= 7000) break;
}
const bright = (c) => (c >> 16 & 255) + (c >> 8 & 255) + (c & 255);
check("silent before the pads, it sounds after", sum[1] > 1 && sum[1] > sum[0] * 10, sum.join(" "));
check("the pads glow dim at rest", pads && pads.every((c) => bright(c) > 0 && bright(c) < 120), pads && pads.map((c) => c.toString(16)).join(" "));
check("a pad held lights (bottom-left: pad 8, F3)", padsOn && bright(padsOn[8]) > 200, padsOn && padsOn[8].toString(16));
check("FADER BANK: its LED lit off bank A", (xled & 2) !== 0, xled);
process.exit(fail ? 1 : 0);
