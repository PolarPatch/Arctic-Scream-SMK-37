#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-only
# Copyright (C) 2026 PolarPatch
"""Arctic Scream SMK-37 in host mode (tests/host.c with BOARD_SMK37; firmware/src/smk.c): the faders take over only
once they reach the value, FADER BANK steps the banks (its LED), the mod wheel is SWELL, a pad plays its white key
with its pressure as aftertouch and lights, an outer key plays below F3.
  python3 tests/smk_test.py      (builds build/host/grimm-smk37)"""
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "build" / "host" / "smk"
BIN = ROOT / "build" / "host" / "grimm-smk37"
OUT.mkdir(parents=True, exist_ok=True)
subprocess.run(["cc", "-O2", "-Wall", "-Wno-unused-function", "-DDINGHY_HOST", "-DBOARD_SMK37=1", '-DAPP_VER="2.1.1"',
                "-Dsection(x)=used", "-Ifirmware/hal", "-Ifirmware/src", "-Ifirmware/gen", "-o", str(BIN),
                "firmware/src/grimm.c"], cwd=ROOT, check=True)
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
    return pr, notes


def bright(c):
    return (c >> 16 & 255) + (c >> 8 & 255) + (c & 255)


P = lambda *ts: [(t, "probe") for t in ts]
pr, notes = run("smk", P(3000) + [(4000, "fader 0 50")] + P(4100) + [(4200, "fader 0 110"), (4400, "fader 0 120")] + P(4600) +
                [(5000, "xbtn 15"), (5100, "fader 1 10")] + P(5200) + [(6000, "mod 474")] + P(6300) +
                [(7000, "pad 8 90")] + P(7300) + [(8000, "okey 0 100")] + P(8300), 9000)
check("at power-on: bank A, the levels as they were, the pads a dim glow",
      pr[3000]["bank"] == "0" and pr[3000]["lvl"] == "100,100,100,100" and all(0 < bright(c) < 120 for c in pr[3000]["pads"]), pr[3000])
check("a fader below the value: nothing yet (soft takeover)", pr[4100]["lvl"].startswith("100,"), pr[4100]["lvl"])
check(".. once past it, it sets T1's LEVEL", pr[4600]["lvl"].startswith("120,"), pr[4600]["lvl"])
check("FADER BANK: bank B, its LED lit; a fader there not taken at once", pr[5200]["bank"] == "1" and pr[5200]["xled"] == "2" and
      pr[5200]["spc"] == pr[4600]["spc"], pr[5200])
check("the mod wheel up: SWELL 127", pr[6300]["sw"] == "127", pr[6300]["sw"])
check("a pad (bottom-left, F3): its note, its pressure as aftertouch, its light",
      "1:41" in notes[7300] and pr[7300]["press"] == "90" and bright(pr[7300]["pads"][8]) > 200, (notes[7300], pr[7300]))
check("an outer key (C3): the note five below F3, on the selected track", "1:36" in notes[8300], notes[8300])
sys.exit(1 if fails else 0)
