/* SPDX-License-Identifier: GPL-3.0-only
 * Copyright (C) 2026 PolarPatch */
/* Arctic Scream SMK-37: what the keyboard has beyond the FM-1's panel (hal/smk_input.h reads it; the FM-1's keys,
 * buttons and knobs arrive as on the FM-1). The outer keys, the faders and their banks, the wheels, the pads'
 * pressure and their lights. The approach after GHOULBOX, AMB-1 and Skiff on the SMK-37 (soft takeover, banks),
 * written anew. Main loop only (app_step: smk_poll; ui_update: smk_pads).
 *   outer keys   C3..E3 and G#5..C6: the notes below and above the FM-1's 27, on the selected track (as MIDI in)
 *   faders       FADER BANK steps A, B, C (its LED lit off A); a fader takes over only once it reaches the value
 *                (it never jumps); A: T1..T4 LEVEL; B: DELAY, SPACE, GRAIN, SHIMMER; C: SWELL, MASTER CUTOFF,
 *                DRIVE, SPACE SIZE
 *   mod wheel    SWELL (as CC 1 from a MIDI keyboard)
 *   pitch wheel  the selected track bent, +-2 semitones (its centre learned at rest, as genkigenki's layer does)
 *   pads         the keys play the notes, so the pads play the piece (as on Arctic Scream VIBE): the top row 1..4
 *                the tracks (the selected one again: its LATCH), 5..8 the slots A..D; the bottom row the FX layer's
 *                eight tricks, each on while held (REV THROW, ECHO THROW, TAPE STOP, REVERSE, FILTER DOWN, FILTER
 *                UP, STUTTER, SWELL). Their pressure: the selected track's aftertouch (Holvut and the screams harder)
 *   SEQ held     the bottom row: DICE's eight moods (as SEQ held + G3 .. G4)
 *   KNOB BANK    held: the top row 1..4 mute T1..T4, 5..8 save into A..D; the bottom row the eight Sami seasons
 *   pad lights   what they do now: the tracks in their colours, the slots used, the tricks bright while held
 *   < / >        the previous / next page of the page's button (as tapping it again) */

#if BOARD_SMK37
#define SMK_NBANK 3u
static uint32_t smk_bank;                       /* FADER BANK: 0 A, 1 B, 2 C */
static uint8_t smk_fseen[4] = {0xFF, 0xFF, 0xFF, 0xFF};   /* the faders as last read (0xFF: not yet) */
static uint8_t smk_ftaken;                      /* bit f: fader f has the value (soft takeover) */
static uint8_t smk_oheld[FM1_NKEY];             /* an outer key's note (+1) while it is down */
static uint8_t smk_press_was;
static int32_t smk_pb_c = -1, smk_pb_lo = 445, smk_pb_hi = 640, smk_pb_t = -1;   /* the pitch wheel: its centre
                                                 * (raw), its travel seen, the track it bends */
static uint16_t smk_pheld;                      /* the pads held at the last poll */
static uint32_t smk_pf;                         /* the tricks the pads hold (bit PF_) */
static uint32_t smk_seq_used;                   /* (SEQ held + a pad: no page change when SEQ is let go: app_step) */
static const char *const SMK_PF_NAME[NPF] = {"REV THROW", "ECHO THROW", "TAPE STOP", "REVERSE", "FILTER DOWN",
                                             "FILTER UP", "STUTTER", "SWELL"};
static int32_t smk_mod_was = -1, smk_mod_lo = 474, smk_mod_hi = 629;   /* the mod wheel: last value; its travel (raw,
                                                 * up = lower), widened to what it has shown (units differ) */
/* bank b, fader f: (page, knob, track: 4 = the selected); SWELL: page NPAGE (its own) */
static const uint8_t SMK_FAD[SMK_NBANK][4][3] = {
    {{PG_MIX1, 0, 0}, {PG_MIX1, 0, 1}, {PG_MIX1, 0, 2}, {PG_MIX1, 0, 3}},
    {{PG_DELAY, 3, 4}, {PG_SPACE, 2, 4}, {PG_GRAIN, 3, 4}, {PG_AIR, 1, 4}},
    {{NPAGE, 0, 4}, {PG_MASTER, 0, 4}, {PG_DRIVE, 3, 4}, {PG_SPACE, 0, 4}},
};
static const char *const SMK_BANK_NAME[SMK_NBANK] = {"FADERS: LEVELS", "FADERS: FX", "FADERS: SWELL, TONE"};

static int32_t smk_fad_now(const uint8_t *F)    /* where the fader's parameter is now, 0..127 */
{
    volatile int32_t *p;
    uint32_t s = sel;
    int32_t lo, hi, v;
    if (F[0] == NPAGE) return sw_cc;
    sel = F[2] < 4u ? F[2] : sel;
    p = knob_param(F[0], F[1]), lo = knob_min(F[0], F[1]), hi = knob_max(F[0], F[1]);
    v = p && hi > lo ? (int32_t)((*p - lo) * 127 / (hi - lo)) : 0;
    sel = s;
    return v;
}
static void smk_fad_set(const uint8_t *F, uint32_t val)
{
    uint8_t L[5];
    if (F[0] == NPAGE) { sw_cc = (int32_t)val; return; }
    L[0] = 0, L[1] = F[0], L[2] = F[1], L[3] = (uint8_t)(F[2] < 4u ? F[2] : sel), L[4] = 0;
    cc_apply(L, val);
}

static uint32_t smk_page_step(int dir)          /* the page before / after this one, among its button's */
{
    uint32_t b = PAGES[page].btn, p0 = page, q = page, before = page, n;
    if (b >= 14u || !(BTN_PAGES >> b & 1u)) return page;
    if (dir > 0) return next_page(b);
    for (n = 0; n < NPAGE; n++) {               /* (the one whose next is this) */
        before = q, page = q, q = next_page(b);
        if (q == p0) break;
    }
    page = p0;
    return before;
}

static void smk_poll(void)
{
    int32_t e;
    uint32_t f;
    if (fm1_in.pressed_x & 1u << (SMK_B_FADER_BANK - 14u)) {   /* FADER BANK: the next bank, each fader to be taken again */
        smk_bank = (smk_bank + 1u) % SMK_NBANK, smk_ftaken = 0;
        hd_say(SMK_BANK_NAME[smk_bank]);
    }
    if (fm1_in.pressed_x & 1u << (SMK_B_RIGHT - 14u)) page = smk_page_step(1), midi_touch = 1;
    if (fm1_in.pressed_x & 1u << (SMK_B_LEFT - 14u)) page = smk_page_step(-1), midi_touch = 1;
    fm1_in.pressed_x = 0;
    smk_led_extra(SMK_B_FADER_BANK, smk_bank != 0u);
    smk_pad_pick = 1;                           /* (the pads play no notes: the hardware layer hands their hits over) */
    smk_led_extra(SMK_B_KNOB_BANK, fm1_in.xbuttons & 1u);
    {                                           /* the pads: their hits since the last poll, the ones held now */
        uint32_t h = smk_pick_hits, held = 0, p, kb = fm1_in.xbuttons & 1u, sq = fm1_in.buttons >> BTN_SEQ & 1u, pf = 0;
        smk_pick_hits = 0;
        for (p = 0; p < SMK_NPAD; p++)
            if (fm1_in.pad_st[p] == 0x80u) held |= 1u << p;
        for (p = 0; p < SMK_NPAD; p++) {
            if (!(h >> p & 1u)) continue;
            midi_touch = 1;
            if (kb) {                           /* KNOB BANK held: mutes, saves, the seasons */
                if (p < 4u) {
                    trk_mute ^= 1u << p;
                    put_s(put_u(put_s(hd_msg, "T"), p + 1u), trk_mute >> p & 1u ? " MUTED" : " ON");
                    hd_until = fm1_ms + 1500u;
                } else if (p < 8u) slot_do_save(p - 4u);
                else knob_step(PG_JAHKI, 1u, (int32_t)(p - 8u) - yr_season);
            } else if (p < 4u) {                /* the tracks; the selected one again: its LATCH */
                if (p == sel) set_latch(!trk[sel].latch), hd_say(trk[sel].latch ? "LATCH ON" : "LATCH OFF");
                else sel = p;
            } else if (p < 8u) slot_do_recall(p - 4u);
            else if (sq) dice(p - 8u, (uint32_t)(KEY0 + 12 * set.oct)), smk_seq_used = 1;
            else hd_say(SMK_PF_NAME[p - 8u]);
        }
        if (!kb && !sq)                         /* the tricks: on while their pad is held (a tap: at least this poll) */
            for (p = 8u; p < SMK_NPAD; p++)
                if ((held | h) >> p & 1u) pf |= 1u << (p - 8u);
        pf_held = (pf_held & ~smk_pf) | pf;
        smk_pf = pf, smk_pheld = (uint16_t)held;
    }
    for (f = 0; f < 4u; f++) {
        const uint8_t *F = SMK_FAD[smk_bank][f];
        uint32_t v = fm1_in.fader[f];
        int32_t now;
        if (smk_fseen[f] == 0xFF) { smk_fseen[f] = (uint8_t)v; continue; }   /* (at power-on: where it stands) */
        if (v == smk_fseen[f]) continue;
        now = smk_fad_now(F);
        if (!(smk_ftaken >> f & 1u) &&           /* taken once it reaches the value, or passes it */
            (((int32_t)v - now <= 2 && now - (int32_t)v <= 2) || (smk_fseen[f] < now) != ((int32_t)v < now)))
            smk_ftaken |= (uint8_t)(1u << f);
        smk_fseen[f] = (uint8_t)v;
        if (smk_ftaken >> f & 1u) smk_fad_set(F, v), midi_touch = 1;   /* (app_step: t_touch) */
    }
    if (fm1_in.wheel[1]) {                      /* the mod wheel: SWELL (a dead band at rest) */
        int32_t w = fm1_in.wheel[1], v;
        if (w < smk_mod_lo) smk_mod_lo = w;
        if (w > smk_mod_hi) smk_mod_hi = w;
        v = (smk_mod_hi - 6 - w) * 127 / (smk_mod_hi - 6 - smk_mod_lo);
        v = clamp(v, 0, 127);
        if (smk_mod_was < 0 || v > smk_mod_was + 1 || v < smk_mod_was - 1 || (v != smk_mod_was && (v == 0 || v == 127)))
            smk_mod_was = v, sw_cc = v;
    }
    if (fm1_in.wheel[0]) {                      /* the pitch wheel: the selected track, +-2 semitones (32 / 16) */
        int32_t w = fm1_in.wheel[0], d, b;
        if (smk_pb_c < 0) smk_pb_c = w;         /* (at rest at power-on: its centre) */
        if (w < smk_pb_lo) smk_pb_lo = w;
        if (w > smk_pb_hi) smk_pb_hi = w;
        d = w - smk_pb_c;
        if (d > -12 && d < 12) {                /* (a dead band: at rest, the centre follows its drift) */
            smk_pb_c += d > 0 ? (d > 2) : -(d < -2);
            b = 0;
        } else
            b = d > 0 ? (d - 12) * 32 / (smk_pb_hi - smk_pb_c - 12 > 1 ? smk_pb_hi - smk_pb_c - 12 : 1)
                      : (d + 12) * 32 / (smk_pb_c - smk_pb_lo - 12 > 1 ? smk_pb_c - smk_pb_lo - 12 : 1);
        b = clamp(b, -32, 32);
        if (smk_pb_t >= 0 && smk_pb_t != (int32_t)sel) smk_bend16[smk_pb_t] = 0;   /* (another track: the last let go) */
        smk_pb_t = (int32_t)sel, smk_bend16[sel] = b;
    }
    {                                           /* the pads' pressure: the selected track's aftertouch */
        uint32_t p, m = 0;
        for (p = 0; p < SMK_NPAD; p++)
            if (fm1_in.pad_press[p] > m) m = fm1_in.pad_press[p];
        if (m != smk_press_was) smk_press_was = (uint8_t)m, hw_press[sel] = (uint8_t)m;
    }
    while ((e = smk_extkey_take()) >= 0) {      /* the outer keys: the notes below and above, the selected track */
        uint32_t k = (uint32_t)e >> 8, n;
        if (k >= FM1_NKEY) continue;
        if (e & 0xFF) {
            int32_t nn = (int32_t)(KEY0 + 12 * set.oct) + (int32_t)k - (int32_t)SMK_KEY_F3;
            if (nn < 0 || nn > 127) continue;
            n = sc_snap((uint32_t)nn);
            if (smk_oheld[k]) nq_note(NQ_OFF, sel, 0, MIDI_ID(smk_oheld[k] - 1u));
            nq_note(trk[sel].latch ? NQ_TOGGLE : NQ_ON, sel, n, MIDI_ID(n));
            smk_oheld[k] = (uint8_t)(n + 1u);
            ch_last = (int32_t)n;
            midi_touch = 1;
        } else if (smk_oheld[k]) {
            if (!trk[sel].latch) nq_note(NQ_OFF, sel, 0, MIDI_ID(smk_oheld[k] - 1u));
            smk_oheld[k] = 0;
        }
    }
}

static void smk_pads(void)                      /* the pads' lights: what each one does now */
{
    static const uint8_t SC[8][3] = {{0x1c, 0x2a, 0x6e}, {0x9c, 0xc8, 0xf0}, {0x3f, 0xb9, 0x50}, {0x7c, 0xd8, 0x6a},
                                     {0xff, 0xcb, 0x47}, {0xd9, 0xa4, 0x41}, {0xb0, 0x5a, 0x3a}, {0x6a, 0x6e, 0x9a}};
    static const uint8_t PF[NPF][3] = {{0xa7, 0x8b, 0xfa}, {0x4f, 0x8c, 0xff}, {0xff, 0xb0, 0x40}, {0xff, 0x7a, 0x30},
                                       {0x22, 0xd3, 0xee}, {0x3f, 0xb9, 0x50}, {0xff, 0x1a, 0x8c}, {0xea, 0xf6, 0xfa}};
    uint32_t p, kb = fm1_in.xbuttons & 1u, sq = fm1_in.buttons >> BTN_SEQ & 1u;
    for (p = 0; p < SMK_NPAD; p++) {
        uint32_t r, g, b, on = smk_pheld >> p & 1u;
        if (p < 4u) {                           /* the tracks, in their colours (KNOB BANK: dark when muted) */
            uint32_t c = wv_col(p), lit = kb ? !(trk_mute >> p & 1u) : p == sel;
            r = (c >> 11 & 31u) << 3, g = (c >> 5 & 63u) << 2, b = (c & 31u) << 3;
            if (kb && (trk_mute >> p & 1u)) r = 0x60, g = 0, b = 0;
            else if (!lit) r >>= 3, g >>= 3, b >>= 3;
        } else if (p < 8u) {                    /* the slots: used dim, the one in use bright (KNOB BANK: save, magenta) */
            uint32_t k = p - 4u;
            if (kb) r = 0xff, g = 0x1a, b = 0x8c, r = on ? r : r >> 3, g = on ? g : g >> 3, b = on ? b : b >> 3;
            else if ((int32_t)k == slot_cur && slot_used(k)) r = 0x22, g = 0xd3, b = 0xee;
            else if (slot_used(k)) r = 0x04, g = 0x1a, b = 0x1e;
            else r = g = b = 0;
        } else if (kb) {                        /* the seasons */
            const uint8_t *c = SC[p - 8u];
            uint32_t sh = (int32_t)(p - 8u) == yr_season ? 0u : 3u;
            r = c[0] >> sh, g = c[1] >> sh, b = c[2] >> sh;
        } else if (sq) {                        /* DICE */
            r = 0xff, g = 0x1a, b = 0x8c;
            if (!on) r >>= 3, g >>= 3, b >>= 3;
        } else {                                /* the tricks: bright while held */
            const uint8_t *c = PF[p - 8u];
            uint32_t sh = pf_held >> (p - 8u) & 1u ? 0u : 3u;
            r = c[0] >> sh, g = c[1] >> sh, b = c[2] >> sh;
        }
        padled_set(p, (uint8_t)r, (uint8_t)g, (uint8_t)b);
    }
    padled_flush();
}
#ifdef DINGHY_HOST
static void smk_probe(void)                     /* (host: tests/probe.c, "smkprobe MS bend B16 bank B sw S press P lit L xled X
                                                 * lvl L1,L2,L3,L4 dly D spc S mcut C pf F sel T mute M lat L pads RRGGBB x16") */
{
    uint32_t p, s0 = sel;
    int32_t lv[4];
    for (p = 0; p < 4u; p++) sel = p, lv[p] = *knob_param(PG_MIX1, 0);
    sel = s0;
    printf("smkprobe %u bend %d bank %u sw %d press %u lit %x xled %x lvl %d,%d,%d,%d dly %d spc %d mcut %d pf %x sel %u mute %x lat %d pads",
           fm1_ms, (int)smk_bend16[sel], smk_bank, (int)sw_cc, hw_press[sel], host_lit, smk_xled, (int)lv[0], (int)lv[1],
           (int)lv[2], (int)lv[3], (int)*knob_param(PG_DELAY, 3), (int)*knob_param(PG_SPACE, 2), (int)mf_cut,
           (unsigned)pf_held, (unsigned)sel, (unsigned)trk_mute, (int)trk[sel].latch);
    for (p = 0; p < SMK_NPAD; p++) printf(" %06x", host_pad_rgb[p]);
    printf("\n");
}
#endif
#else
static void smk_poll(void) {}
static void smk_pads(void) {}
#endif
