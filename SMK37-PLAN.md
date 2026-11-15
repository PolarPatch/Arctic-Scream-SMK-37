# Arctic Scream SMK-37: the plan

Arctic Scream for the M-VAVE SMK-37 Pro (and the SMK-37 Elite and MKE-P37, the same keyboard under other names).
This repository is a fork of [Arctic Scream for the FM-1](https://github.com/PolarPatch/Arctic-scream-FM-1); the
engine stays the FM-1's (merged from upstream), and everything for the keyboard sits behind `BOARD_SMK37`.

Status (2026-11-15): the board layer, the controls, the simulator and the browser's SMK-37 are built and tested off
the keyboard (`tests/smk_test.py`, `web/test_smk37.mjs`); three packages build (Pro, Elite, MKE-P37). Nothing here has
run on an SMK-37 yet.

## Keeping up with the FM-1

The engine is the FM-1's: everything Arctic Scream gains there comes here by a merge (the history is shared), and
Arctic Scream VIBE takes the same engine (`tools/sync_engine.sh` there):

```sh
git fetch upstream && git merge upstream/main     # upstream: PolarPatch/Arctic-scream-FM-1
```

The SMK-37's own changes stay behind `BOARD_SMK37` (and `smk.c`, `smk_input.h`), so a merge rarely meets them.

## What the others did (25 firmwares on the SMK-37, five looked at closely)

| Firmware | Pads | Faders | Wheels | KNOB BANK / FADER BANK |
| --- | --- | --- | --- | --- |
| GHOULBOX (dungeon synth, drones) | the 16 white keys F3..G5, velocity, low notes on the bottom row; a grid where the keys are one | banks: level, pan, reverb send, delay send for tracks 1..4 | bend, mod (CC1) | KNOB BANK opens the menu; FADER BANK steps the bank |
| AMB-1 (generative ambient) | bells: 16 scale steps up from the chord's root; the chord glows | banks: levels, space, the garden (evolve, motion, drift, density) | bend, vibrato | KNOB BANK: a picker on the pads (pieces top, modes bottom) |
| MAKU (generative ambience) | 16 "likes": a world remembered and recalled | standing amounts of the verbs | pitch: sink/lift; mod: wobble | menu |
| OberVave (poly synth) | the step sequencer | A filter (cutoff, reso, env, release), B effects | bend, vibrato | FADER BANK: bank A/B; KNOB BANK held: panel check |
| Skiff (groovebox) | steps of the page, or the keys' map in a layer | a mixer: level, pan, reverb, delay | bend, CC1, pedal sustain | KNOB BANK is SHIFT |

What they all share, and Arctic Scream keeps: K1 is MASTER (a virtual pot), K2..K4 SELECT, ALGORITHM, PRESETS,
K5..K8 KNOB 1..4; the FM-1's buttons on their printed counterparts; a fader takes over only once it moves; the
outer keys play below and above; the factory calibration read, never written; OCTAVE- at power-on is the USB
rescue, OCTAVE- + OCTAVE+ held 5 s update mode.

## The controls (as built)

| SMK-37 | Arctic Scream |
| --- | --- |
| Keys F3..G5 | the FM-1's 27 keys |
| Keys C3..E3, G#5..C6 | the notes below and above, on the selected track |
| K1 | MASTER |
| K2 / K3 / K4 | SELECT / ALGORITHM / PRESETS |
| K5..K8 | KNOB 1..4 |
| PATCH / BT | HOME / SAVE |
| PARA / CHORD / NOTE REPEAT / SCALE / GLOBE | EDIT / ENV / LFO / SEL / GLO |
| FX / ARP / SEQ | FX / ARP / SEQ |
| SEQ PLAY / SEQ REC | PLAY / REC |
| OCTAVE- / OCTAVE+ | OCT- / OCT+ |
| < / > | the previous / next page |
| 16 pads | the 16 white keys F3..G5 (as GHOULBOX), low notes on the bottom row; the pressure goes to the note as aftertouch (Holvut overblows, ICE WRAITH screams harder) |
| pad lights | a sounding key's pad in the accent, the rest a dim glow tinted by JAHKI's season (later: each track's colour, breathing with what it plays) |
| KNOB BANK | the pads as a picker while held: top row the slots A..D; bottom row the eight Sami seasons (JAHKI) |
| FADER BANK | A: T1..T4 levels; B: DELAY, SPACE, GRAIN, SHIMMER; C: SWELL, MASTER CUTOFF, DRIVE, SPACE SIZE |
| Pitch wheel | bend, the selected track, +-2 semitones |
| Mod wheel | SWELL (CC 1, as on the FM-1 with a MIDI keyboard) |
| Pedal | LATCH held (to do: wants the keyboard, the pedal's polarity) |

## Steps

1. (done) The repository, this plan, the board layer (GPL-3.0, genkigenki's SMK-37 port of Felucca, via GHOULBOX's
   `ghoulbox-smk37` branch) behind `BOARD_SMK37`; the FM-1 build unchanged.
2. (done) The simulator (`tests/host.c`) and the browser demo with the SMK-37's panel: 37 keys, pads, faders, wheels.
3. To do off the keyboard: the keys' and the pads' velocity into the engine (it has none yet), the pedal.
4. When the keyboard is here: a full flash backup first (`trimdat` at 0xC1224), the identity (`--info`), then the
   board layer brought up piece by piece: screen, keys, buttons, encoders, pads, faders, wheels, LEDs, saving.

## Sources

- [The Firmware Hub's SMK-37 page](https://thefirmwarehub.com/smk37/), the 25 ports.
- [fm1-to-smk37](https://github.com/genkigenki/fm1-to-smk37): the hardware notes (CC BY-NC 4.0: read, never
  copied into this GPL code).
- The board layer's code: [genkigenki/Felucca, ghoulbox-smk37](https://github.com/genkigenki/Felucca/tree/ghoulbox-smk37)
  (GPL-3.0-only).
