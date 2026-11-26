#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-only
# Copyright (C) 2026 PolarPatch
"""Arctic Scream SMK-37 in host mode (tests/host.c with BOARD_SMK37; firmware/src/smk.c): the faders take over only
once they reach the value, FADER BANK steps the banks (its LED), the mod wheel is SWELL, the pads play the piece (the
tracks, the slots, the FX tricks held, KNOB BANK's mutes and seasons) with their pressure as aftertouch, an outer key
plays below F3.
  python3 tests/smk_test.py      (builds build/host/arctic-smk37)"""
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "build" / "host" / "smk"
BIN = ROOT / "build" / "host" / "arctic-smk37"
OUT.mkdir(parents=True, exist_ok=True)
subprocess.run(["cc", "-O2", "-Wall", "-Wno-unused-function", "-DDINGHY_HOST", "-DBOARD_SMK37=1", '-DAPP_VER="2.1.1"',
                "-Dsection(x)=used", "-Ifirmware/hal", "-Ifirmware/src", "-Ifirmware/gen", "-o", str(BIN),
                "firmware/src/arctic.c"], cwd=ROOT, check=True)
fails = 0


def check(name, ok, info=""):
    global fails
    print(f"  {'ok  ' if ok else 'FAIL'}  smk37: {name}" + ("" if ok else f"  {info}"))
    fails += not ok


def run(name, ev, end):
    s = OUT / f"{name}.txt"
    s.write_text("".join(f"{t} {l}\n" for t, l in ev) + f"{end} end\n")
    out = subprocess.run([str(BIN), str(OUT / name), str(s)], capture_output=True, text=True, check=True, cwd=ROOT).stdout
    pr = {}
    for m in re.finditer(r"^smkprobe (\d+) (.*)$", out, re.M):
        f = m.group(2).split(" pads ")
        w = f[0].split()
        d = dict(zip(w[::2], w[1::2]))
        d["pads"] = [int(x, 16) for x in f[1].split()]
        pr[int(m.group(1))] = d
    notes = {int(m.group(1)): m.group(2).split() for m in re.finditer(r"^probe (\d+) .*? notes(.*?) fx ", out, re.M)}
    for m in re.finditer(r"^probe (\d+) .*? ui page (\d+)", out, re.M):
        pr.setdefault(int(m.group(1)), {})["page"] = int(m.group(2))
    for m in re.finditer(r"^jkprobe (\d+) .*? ys (-?\d+)", out, re.M):
        pr.setdefault(int(m.group(1)), {})["ys"] = int(m.group(2))
    return pr, notes


def bright(c):
    return (c >> 16 & 255) + (c >> 8 & 255) + (c & 255)


P = lambda *ts: [(t, "probe") for t in ts]
pr, notes = run("smk", P(3000) + [(4000, "fader 0 50")] + P(4100) + [(4200, "fader 0 110"), (4400, "fader 0 120")] + P(4600) +
                [(5000, "xbtn 15"), (5100, "fader 1 10")] + P(5200) + [(6000, "mod 474")] + P(6300) +
                [(7000, "pad 8 90")] + P(7300) + [(7500, "pad 8 0")] + P(7700) + [(8000, "okey 0 100")] + P(8300), 9000)
pd = pr[3000]["pads"]
check("at power-on: bank A, the levels as they were; the pads: T1 lit, T2..T4 and the tricks dim, no slot used",
      pr[3000]["bank"] == "0" and pr[3000]["lvl"] == "100,100,100,100" and bright(pd[0]) > 200 and
      all(0 < bright(pd[p]) < 120 for p in (1, 2, 3, *range(8, 16))) and all(pd[p] == 0 for p in range(4, 8)), pr[3000])
check("a fader below the value: nothing yet (soft takeover)", pr[4100]["lvl"].startswith("100,"), pr[4100]["lvl"])
check(".. once past it, it sets T1's LEVEL", pr[4600]["lvl"].startswith("120,"), pr[4600]["lvl"])
check("FADER BANK: bank B, its LED lit; a fader there not taken at once", pr[5200]["bank"] == "1" and pr[5200]["xled"] == "2" and
      pr[5200]["spc"] == pr[4600]["spc"], pr[5200])
check("the mod wheel up: SWELL 127", pr[6300]["sw"] == "127", pr[6300]["sw"])
check("a bottom-row pad held: its trick (the first: REV THROW) while held, no note, its pressure as aftertouch, lit",
      pr[7300]["pf"] == "1" and not any(n.startswith("1:41") for n in notes[7300]) and pr[7300]["press"] == "90" and
      bright(pr[7300]["pads"][8]) > 200 and pr[7700]["pf"] == "0", (notes[7300], pr[7300], pr[7700]["pf"]))
check("an outer key (C3): the note five below F3, on the selected track", "1:36" in notes[8300], notes[8300])

pr, notes = run("pages", P(3000) + [(3200, "xbtn 17")] + P(3400) + [(3600, "xbtn 16")] + P(3800) +
                [(4000, "xbtn 114"), (4200, "pad 10 100"), (4400, "pad 10 0")] + P(4600) + [(4800, "xbtn 214")] + P(5000), 5200)
check("> the next page of the page's button, < back", pr[3400]["page"] != pr[3000]["page"] and pr[3800]["page"] == pr[3000]["page"],
      [pr[t]["page"] for t in (3000, 3400, 3800)])
check("KNOB BANK held: a bottom-row pad picks a season (the third: GIDDA), no note; its LED lit while held",
      pr[4600]["ys"] == 2 and notes[4600] == [] and pr[4600]["xled"] == "1" and pr[5000]["xled"] == "0",
      (pr[4600].get("ys"), notes[4600], pr[4600]["xled"], pr[5000]["xled"]))
pr, notes = run("pads", P(3000) + [(3200, "pad 2 80"), (3300, "pad 2 0")] + P(3500) + [(3700, "pad 2 80"), (3800, "pad 2 0")] +
                P(4000) + [(4200, "xbtn 114"), (4300, "pad 0 80"), (4400, "pad 0 0"), (4500, "xbtn 214")] + P(4700), 5000)
check("a top-row pad: its track; again: its LATCH; KNOB BANK + the first: T1 muted",
      pr[3500]["sel"] == "2" and pr[4000]["sel"] == "2" and pr[4000]["lat"] != pr[3500]["lat"] and pr[4700]["mute"] == "1",
      [(pr[t]["sel"], pr[t]["lat"], pr[t]["mute"]) for t in (3500, 4000, 4700)])
pr, notes = run("bend", [(2900, "pitch 535"), (3000, "keys 1")] + P(3500) + [(4000, "pitch 640")] + P(4500) +
                [(5000, "pitch 536")] + P(5500), 6000)
check("the pitch wheel: at rest no bend, full up two semitones (32 / 16), back at rest none",
      pr[3500]["bend"] == "0" and pr[4500]["bend"] == "32" and pr[5500]["bend"] == "0",
      [pr[t]["bend"] for t in (3500, 4500, 5500)])
# (2.1.7) the keybed's velocity (TOUCH starts at VELOCITY on the SMK-37): a soft key quieter than a hard one
pr, notes = run("vel", [(2900, "touch 0 20 0"), (3000, "keys 1")] + P(3200) + [(3300, "keys 0"), (3400, "touch 0 120 0"),
                (3500, "keys 1")] + P(3700) + [(3800, "keys 0")], 4000)
check("velocity: the key's own (20, 120), a soft note's level under a hard one's",
      pr[3200]["tvel"] == "20" and pr[3700]["tvel"] == "120" and 0 < int(pr[3200]["vg"]) < int(pr[3700]["vg"]),
      [(pr[t]["tvel"], pr[t]["vg"]) for t in (3200, 3700)])
# (2.1.7) SUSTAIN: the pedal (rest learnt at power-on), and CC 64 in
L0 = [(2500, "pad 0 80"), (2550, "pad 0 0"), (2600, "probe")]   # (T1's LATCH off: the pad of the selected track again)
pr, notes = run("sus", [(0, "pedal 1000")] + L0 + [(2900, "keys 1")] + P(3100) + [(3200, "pedal 10"), (3300, "keys 0")] + P(3600) +
                [(3700, "keys 4")] + P(3800) + [(3900, "keys 0")] + P(4100) + [(4200, "pedal 1000")] + P(4400) +
                [(5000, "midi 0xB0 64 127"), (5100, "keys 1"), (5200, "keys 0")] + P(5400) + [(5500, "midi 0xB0 64 0")] + P(5700), 6000)
check("(T1's LATCH off for these)", pr[2600]["lat"] == "0", pr[2600]["lat"])
check("the pedal down: a key let go sounds on; up: it goes",
      "1:41" in " ".join(notes[3100]) and pr[3600]["sus"] == "1" and len(notes[3600]) == 1 and
      len(notes[4100]) == 2 and pr[4100]["held"] == "2" and notes[4400] == [] and pr[4400]["sus"] == "0",
      [(notes[t], pr[t]["sus"], pr[t]["held"]) for t in (3100, 3600, 4100, 4400)])
check("CC 64 in: the same; 0 lets go", len(notes[5400]) == 1 and pr[5400]["sus"] == "2" and notes[5700] == [],
      [(notes[t], pr[t]["sus"]) for t in (5400, 5700)])
pr, notes = run("sus2", [(0, "pedal 1000")] + L0 + [(3000, "pedal 10"), (3100, "keys 1"), (3200, "keys 0"), (3300, "keys 1")] + P(3500) +
                [(3600, "keys 0"), (3700, "pedal 1000")] + P(4000), 4200)
check("the pedal down, a key played again: one voice, not two; up: none", len(notes[3500]) == 1 and notes[4000] == [],
      [notes[t] for t in (3500, 4000)])
sys.exit(1 if fails else 0)
