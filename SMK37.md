# Arctic Scream on the M-VAVE SMK-37

Arctic Scream, the long dark screaming ambient firmware of the FM-1, built for the M-VAVE SMK-37: the same engine,
sounds, screens and pieces, played from 37 keys, 16 pads, eight knobs, four faders and two wheels.

> **Not yet run on a keyboard.** Everything here builds and is tested in the simulator and the browser; the first
> SMK-37 arrives in December 2026. Until it has been brought up on one, do not install it.

## Models

| Your keyboard | Package | Identity |
| --- | --- | --- |
| SMK-37 Pro, Starrykey 37 Play | `arctic-scream-smk37-X.Y.fwsc` | `SMK-37 Pro_977` |
| SMK-37 Elite | `arctic-scream-smk37-elite-X.Y.fwsc` | `SMK-37 Elite_977` |
| MKE-P37 | `arctic-scream-smk37-mke-X.Y.fwsc` | `MKE-P37_977` |

The same keyboard under three names. Each package keeps its model's name, so M-VAVE's own updater still takes that
model's factory firmware afterwards.

## Before you install: a backup

The SMK-37 keeps things in its flash that belong to your unit alone and cannot be downloaded again: the key, pad and
wheel calibration (0xC1000), the Bluetooth pairing, the chip's key data. Arctic Scream never writes there (its flash
map refuses those ranges when it is built, and its flash driver refuses them again when it runs); it only **reads**
the calibration, to give every key and pad its own velocity curve.

Make a full flash backup first anyway: [fm1-to-smk37, update and recovery](https://github.com/genkigenki/fm1-to-smk37/blob/main/docs/02-update-and-recovery.md),
section 3. Check that the text `trimdat` sits at offset `0xC1224` of the dump, and keep two copies.

## Install

```sh
python3 tools/fm1_install.py --info                                 # what the keyboard runs now
python3 tools/fm1_install.py arctic-scream-smk37-X.Y.fwsc           # the package for your model
```

`fm1_install.py` needs `mido` and `python-rtmidi`. It refuses a package for another model.
**USB rescue:** hold **OCTAVE-** while switching on: only the updater runs, install again from there.
**Back to the stock firmware:** your model's factory package with M-VAVE's updater (M-UPGRADE).

## The controls

The FM-1's manual applies; the screen keeps the FM-1's names.

| SMK-37 | Arctic Scream |
| --- | --- |
| Keys F3 .. G5 | the FM-1's 27 keys |
| Keys C3 .. E3, G♯5 .. C6 | the notes below and above, on the selected track |
| K1 | MASTER (the volume) |
| K2 · K3 · K4 | SELECT · ALGORITHM · PRESETS |
| K5 .. K8 | KNOB 1 .. 4 |
| PATCH · BT | HOME · SAVE |
| PARA · CHORD · NOTE REPEAT · SCALE · GLOBE | EDIT · ENV · LFO · SEL · GLO |
| FX · ARP · SEQ | FX · ARP · SEQ |
| SEQ PLAY · SEQ REC | PLAY · REC |
| OCTAVE- · OCTAVE+ | OCT- · OCT+ |
| < · > | the previous · next page of the page's button |
| 16 pads | the white keys F3 .. G5, the low notes on the bottom row; pressed harder, the track's aftertouch (Holvut and the screams howl harder) |
| The pads' lights | a sounding key's pad in the accent; the rest a dim glow, tinted by JAHKI's season |
| KNOB BANK, held | the pads pick: the top row's first four recall the slots A .. D, the bottom row the eight Sami seasons |
| FADER BANK | A: the four tracks' levels · B: DELAY, SPACE, GRAIN, SHIMMER · C: SWELL, MASTER CUTOFF, DRIVE, SPACE SIZE (its LED lit off A) |
| Faders 1 .. 4 | the bank's four; a fader takes over only once it reaches the value, so nothing jumps |
| Mod wheel | SWELL (as CC 1 from a MIDI keyboard) |
| Pitch wheel | the selected track bent, ±2 semitones |

The SMK-37's TRS jack is a MIDI output, and this build does not use it; MIDI in and out go over USB.

## Build

```sh
BOARD=smk37 ./build.sh                 # build/arctic-scream-smk37.fwsc (SMK-37 Pro, Starrykey 37 Play)
BOARD=smk37 MODEL=elite ./build.sh     # build/arctic-scream-smk37-elite.fwsc
BOARD=smk37 MODEL=mke ./build.sh       # build/arctic-scream-smk37-mke.fwsc
./build.sh                             # the FM-1 build, unchanged
python3 tests/smk_test.py              # the SMK-37's controls in the simulator
web/build_web.sh && node web/test_smk37.mjs   # the browser's SMK-37: web/dist/smk37.html
```

Everything for the keyboard sits behind `BOARD_SMK37`; the FM-1 build stays byte for byte as it was.

## Credits

The board layer is genkigenki's SMK-37 port of Felucca (GPL-3.0-only), as [GHOULBOX](https://github.com/genkigenki/Felucca/tree/ghoulbox-smk37)
carries it, adapted to Arctic Scream; the hardware notes are genkigenki's [fm1-to-smk37](https://github.com/genkigenki/fm1-to-smk37).
The controls' layout learns from GHOULBOX, AMB-1, MAKU, OberVave and Skiff on the SMK-37. Details: [LICENSING.md](LICENSING.md).
