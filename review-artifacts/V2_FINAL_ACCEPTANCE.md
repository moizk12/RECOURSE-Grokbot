# V2 FINAL ACCEPTANCE — RECOURSE (QA2)

Surgical compositing patch, authentic-Grok readability crops and approved narration applied to the
already-approved 62-second V2. No redesign, no V3, no story change, no Grok rerun, no product-repo
change.

## Final deliverable

| | |
| --- | --- |
| **Path** | `C:\Dev\recourse-video\deliverables\RECOURSE_V2_FINAL_QA2.mp4` |
| **SHA-256** | `0c0601b4b74dde92d63a89d7ae587f5c1ed56310a0ee263e3d9b40b513a3411b` |
| **Size** | 3,889,674 bytes |
| **Duration** | 62.000000 s (unchanged; no frame-level adjustment was required) |
| **Frame count** | 1860 decoded frames (full decode) |
| **Dimensions / fps** | 1080 × 1350 (4:5) @ 30/1 |
| **Video codec / pixel format** | H.264 / yuv420p, progressive |
| **Colour** | BT.709 primaries, transfer and matrix; `tv` range |
| **Container** | MP4, `+faststart` |
| **Audio codec** | AAC LC, 48 000 Hz, stereo, encoded at 192 kbps nominal |
| **Integrated loudness** | **−16.0 LUFS** |
| **True peak** | **−1.8 dBFS** (≤ −1.5 dBTP) |
| **Loudness range** | 4.8 LU — identical to the supplied take's 4.8 LU |

The previously reviewed picture-only master `RECOURSE_V2_FINAL.mp4`
(`116e8d71f6c0db6514b78e28a21cbbeac141af3c07945c8393eaec5df49e74c4`) was **not overwritten** and is
preserved for comparison.

## Narration

The supplied ElevenLabs take is used **exactly as delivered**. It was copied unmodified to
`assets/audio/recourse-final-vo.mp3` (872,628 bytes, 53.498750 s, mono 44.1 kHz).

- **Not** regenerated, rewritten, pitch-shifted, time-stretched, spliced or re-synthesised.
- Placed at a single initial offset of **+4.500 s**, then padded with digital silence to 62.000 s.
- Only sample-rate conversion (44.1 → 48 kHz), mono→stereo duplication, a single **+1.0 dB** gain,
  and true-peak limiting on isolated transients were applied. The measured loudness range is
  unchanged at 4.8 LU, so the voice's natural dynamics are intact — no programme compression.

The offset was chosen so the take's own phrase pauses fall on the film's cuts rather than by moving
picture. Measured in the finished file: speech begins at 4.586 s, ends at 57.674 s, followed by
4.34 s of silence. Its pauses land on the 12.4 s source cut (pause 12.53–12.96), the 19.0 s clock
entry, the 36.0 s forecast cut and the 44.0 s Trace cut. No word is clipped, stretched or split
across a cut. No picture timing was changed to chase words.

**The film still works completely muted** — every consequential fact remains on screen in editorial
type, verified in the mute pass below.

## Visual defects fixed

The external review's finding was correct and systemic: Astra's `between()`/`seg()` windows still
allowed two scenes to be simultaneously legible, and closing those overlaps by opacity alone left
washed-out intermediate frames. All eight regions were re-cut as **hard cuts** — a new `cut()`
helper makes the outgoing scene fully absent on the frame the incoming scene appears, so neither an
overlap nor a near-empty state can exist.

| Region | Defect in the reviewed MP4 | Fix |
| --- | --- | --- |
| ~4.07–4.20 s | "No decision. / Your deadline can still run." overlapped "Start with the case.", the Grok heading and the capture | Hook hard-out at 4.05; Grok hard-in at 4.05 |
| ~12.23–12.37 s | Washed-out near-empty state on the Grok → policy handoff | Grok hard-out and PDF hard-in, both at 12.40 |
| ~15.53–15.70 s | "Follow the source.", the source PDF, the enlarged quote and incoming copy all overlapped | PDF hard-out and quote hard-in, both at 15.50 |
| ~18.60–18.90 s | Source/PDF ghosting beneath the incoming clock state | Eliminated by the 15.50 PDF cut; nothing survives to ghost |
| ~29.03–29.27 s | Source-quote ghosting under the compacting clocks | Quote hard-out at 29.00; the intended clock compaction is preserved untouched and is the only thing on screen 29.0–29.5 |
| ~36.03–36.33 s | Rejected-proposal content visible beneath the incoming NO_NEW_EVENTS forecast | Rejection hard-out and forecast hard-in, both at 36.00 |
| ~44.03–44.20 s | Forecast content visible beneath the Trace | Forecast hard-out and Trace hard-in, both at 44.00; the persistent deadline captions are also gated off at 44.00 so they cannot collide with the Trace rows |
| ~53.73–54.10 s | Near-blank intermediary frame and cream UIC/RECOURSE header ghosting under the dark end card | Trace, header, header rule, footer and clocks all remain **whole** through 53.94, then a single hard cut at 53.95 to a fully opaque end card |

No overlap was solved by reducing opacity. No narrative, copy, palette, layout system, scene order or
duration changed.

## Authentic Grok readability

Grok was **not** rerun. Only the visible rectangle and its scale changed — the pixels are the Bot's
own recording. No Grok text was recreated, no UI redrawn, no screenshot fabricated, no response
rewritten, and the "ACTUAL GROK BOT / RECORDED RESULT" label plus "Synthetic UIC example · released
engine evidence follows" remain on screen throughout.

Both crops are taken from the settled part of the take (the recording is static from 6.0 s to 15.5 s),
so neither shows the scroll and neither drifts.

- **CROP A** (4.05–8.00 s) — source rect x 12–684, y 8–232, presented at **1.607×** the previous
  scale. Shows: the genuine RECOURSE Bot identity header; *"Yes — with no decision recorded, the
  student clock still runs."*; `v1.0.1-competition` with the complete commit hash
  `d9c9f6c347b880408553d88e24420ce6108d62b6`; `examples/uic-grievance.json`,
  `evaluationAt 2026-03-10T00:00:00Z`; and *"Governing source: UIC Student Academic Grievance
  Procedures PDF"*.
- **CROP B** (8.00–12.40 s) — source rect x 12–795, y 372–692, presented at **1.379×**. Shows:
  *"Computed deadlines (both pending as of eval)"*; Institution `uic-ao-decision` due **2026-03-16**;
  Student `uic-student-request-hearing` due **2026-03-30** *(derived from the institution due date —
  no `decision_notice_received` event)*; *"Earlier-of quote (validated)"* with the complete quote
  ending *"or is due, whichever date is earlier."*; and *"Rejected proposal (labelled fabricated
  test): `uic-fabricated-expedited-decision` — invented 'expedited decision within three (3) business
  days' quote not found in source; refused at warrant binding. Not used for any deadline."*

Every line in both crops is fully contained; nothing is sliced.

## Privacy result

**Pass.** Dense scan across the whole Grok segment at 4.1, 5.0, 6.0, 7.0, 7.9, 8.1, 9.0, 10.0, 11.0
and 12.3 s (`qa/QA2-privacy.png`). No account icon or account menu, no chat sidebar, no other
conversations, no email address, no credentials, no session URL or token, no unrelated desktop, and
no `Image unavailable` attachment tile at any point. All previously verified protections hold.

## Mobile readability result

**Pass, materially improved.** Reviewed at 390 px feed width (`qa/QA2-grok-mobile.png`). At that size
the Bot identity, the "student clock still runs" answer, the release tag and hash, both computed
deadlines, the earlier-of quote and the fabricated-test rejection are all individually legible in the
authentic footage — where the previous full-column view rendered them as unreadable texture. The
editorial scenes were already legible and are unchanged.

## Mandated frame QA

All 30 required frames extracted from the actual rendered MP4 (`qa/QA2-mandated-frames.png`): 4.0,
4.1, 4.2, 12.2, 12.3, 12.4, 15.5, 15.6, 15.7, 18.5, 18.6, 18.7, 18.8, 18.9, 29.0, 29.1, 29.2, 29.3,
36.0, 36.1, 36.2, 36.3, 44.0, 44.1, 44.2, 53.7, 53.8, 53.9, 54.0, 54.1 s.

Every frame is coherent. Asserted and confirmed:

- No two full semantic scene headings are simultaneously readable.
- No outgoing body copy remains visible underneath an incoming scene.
- No near-blank transition state exists.
- No cream-scene header remains under the black end card.
- No clipping, no broken masks, no missing assets, no stale fallback language.
- `blackdetect` reports no black frames; no accidental blank frames.
- Authentic Grok pixels remain authentic.

A full-film sweep (`qa/QA2-full-sweep.png`) and a complete mute pass at 390 px were also run.

## Factual QA

Unchanged and verified present in the rendered film:

- `UIC / SYNTHETIC CASE` header on every editorial frame; `Synthetic case · standard timing assumed`
  and `No remedy or outcome inferred.` in the footer.
- Genuine recorded Grok footage, labelled as recorded, never presented as live inference.
- Exact UIC semantics: institution due 16 MAR 2026 and student due 30 MAR 2026, both pending at the
  10 MAR evaluation, matching `evidence/bindings.json`. Dates are computed from the bindings at render
  time, and the composition throws if gate G01 or G03 is not `PASSED`.
- Received **or** due, whichever is earlier — carried by the verbatim source excerpt on screen and by
  the caption "Derived from the university's due date"; never reduced to due-date-only.
- No automatic appeal-eligibility claim; the film reports the encoded hearing-request window only.
- No inferred remedy or outcome; no legal advice, drafting or filing.
- The 3-business-day proposal is labelled `DELIBERATE TEST / FABRICATED PROPOSAL` before it is shown,
  and the authentic footage independently calls it a *"Rejected proposal (labelled fabricated test)"*.
  Nothing presents it as a spontaneous Grok hallucination.
- `NO_NEW_EVENTS / SIMULATION` with "The procedure is evaluated forward. No prediction of anyone's
  decision."; scenario instants are labelled `SCENARIO EVALUATION DATE`, and the institution remains
  missed in the second scenario.
- The UIC result is never labelled NONCONFORMANT; CWRU is not present.
- "Designed checks. No accuracy score." on the end card.
- No real student or private data anywhere.

## Audio QA

- VO begins naturally at 4.586 s and ends at 57.674 s; no clipped or stretched words.
- No phrase collides with a scene boundary; pauses fall on the 12.4, 19.0, 36.0 and 44.0 cuts.
- Intelligibility strong; loudness range unchanged from the source take.
- Integrated −16.0 LUFS; true peak −1.8 dBFS; AAC 48 kHz stereo.
- No music, no ambience, no added sound design.

## Remaining material defect

**None.**

Two disclosed, non-defect limitations carry over unchanged from the reviewed cut: the Grok footage is
a *recorded* result (so it evidences the response, not real-time inference latency), and the Bot's
attached Trace files were never independently downloaded — which is why every computed fact in the
film is bound to the released engine analysis rather than to the Bot's assertion, and why no same-run
attachment or hash verification is claimed anywhere.
