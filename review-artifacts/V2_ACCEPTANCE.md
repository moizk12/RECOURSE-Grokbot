# V2 ACCEPTANCE — RECOURSE

Taken over from Astra's preserved production state. Creative direction (the 62-second UIC-centered
V2) was implemented as handed over, not redesigned. No Astra invocation, no OpenAI Codex/Work, no
OpenAI credits consumed.

## Final deliverable

| | |
| --- | --- |
| **Path** | `C:\Dev\recourse-video\deliverables\RECOURSE_V2_FINAL.mp4` |
| **SHA-256** | `116e8d71f6c0db6514b78e28a21cbbeac141af3c07945c8393eaec5df49e74c4` |
| **Dimensions** | 1080 × 1350 (4:5) |
| **Frame rate** | 30/1 |
| **Duration** | 62.000000 s |
| **Decoded frame count** | **1860** (full decode, matches 62 s × 30 fps exactly) |
| **Codec / pixel format** | H.264 / yuv420p, progressive |
| **Colour** | BT.709 primaries, transfer and matrix; `tv` range |
| **Container** | MP4, `+faststart`, no audio stream |
| **Size** | 3,376,262 bytes |

## Safe render (preserved, pre-correction)

| | |
| --- | --- |
| **Path** | `C:\Dev\recourse-video\deliverables\RECOURSE_V2_SAFE.mp4` |
| **SHA-256** | `91651a61fca6951ccdeb3dcbf21aa2fddaa0313bb00fdd526b1c03dbf00f20eb` |
| **Rendered with** | Astra's exact preserved command (`--crf=20 --image-format=jpeg`) |
| **Verified** | 1080×1350, 30 fps, 1860 decoded frames, H.264/yuv420p, no black frames |
| **Deviations** | 62.058667 s container duration and an empty AAC track that Remotion emitted; `color_transfer`/`color_primaries` reported `unknown`. Both corrected in FINAL. |

SAFE and FINAL are **not** byte-identical: SAFE had material defects (listed below). SAFE is preserved
as the first complete render, exactly as Astra's instructions required.

## Release basis

- Tag `v1.0.1-competition`, commit `d9c9f6c347b880408553d88e24420ce6108d62b6`.
- The composition throws before rendering a frame if `bindings.json` gate G01 or G03 is not `PASSED`.
- On-screen dates are computed from `evidence/bindings.json` at render time, not typed as literals.

## Recovered state at handover

- `deliverables/` was empty and `qa/render-safe.log` was 0 bytes — **no partial render existed**.
  Astra's report of an interrupted shell (exit 1) is confirmed; nothing was salvageable or corrupt.
- Composition `RECOURSE-V2`, 1080×1350, 30 fps, 1860 frames, no audio — as documented.
- Genuine Grok assets confirmed at the documented paths:
  - `evidence/GROK_ORIGINAL.mkv` — 6,238,686 bytes, 2560×1600, 60 fps, 76.817 s OBS recording
  - `public/grok-result.mp4` — 466,636 bytes, 2560×1600, 30 fps, 16.000 s, 480 frames
  - `evidence/grok-observed-result.txt` — the full observed accessibility transcript
- `node node_modules\typescript\bin\tsc --noEmit` — **exit 0** (Astra could not verify this).

## Genuine Grok evidence — verified in the rendered film

The recorded Grok Bot result occupies 4.05–12.4 s and is **authentic desktop footage**, not a
reconstruction. Verified frame by frame across the whole window (4.4, 5.0, 6.5, 7.5, 8.5, 9.5, 11.0,
11.8, 12.1 s — `qa/grok-privacy-scan.png`):

- **Bot identity readable**: the Grok wordmark and the `RECOURSE` Bot name are visible throughout.
- **Genuine content**: live run on `v1.0.1-competition` (`d9c9f6c347b880408553d88e24420ce6108d62b6`),
  unchanged `examples/uic-grievance.json`, `evaluationAt 2026-03-10T00:00:00Z`; the UIC PDF as
  governing source with `uic-academic-grievance, APPLICABLE`; institution due 2026-03-16 and student
  due 2026-03-30, both pending; the verbatim earlier-of quote; and the rejected proposal explicitly
  labelled a fabricated test.
- **Disclosure preserved**: the Bot's own note that direct package-tool commands still failed
  auto-review binding after approval and that the same approved workflow completed via a launcher
  script remains on screen. Nothing was cropped to hide it.
- **No fabricated continuity**: the label reads `ACTUAL GROK BOT / RECORDED RESULT` and the footer
  reads `Synthetic UIC example · released engine evidence follows`. The film never implies the Bot's
  assertion is the same thing as independently verified engine execution, and never claims same-run
  attachment or hash verification.
- **Privacy**: no account icon or account menu, no chat sidebar, no other conversations, no email
  address, no credentials, no session URL or token, no unrelated desktop. The scroll stops before the
  two `Image unavailable` attachment tiles, so no attachment-failure tile ever appears on screen.

## Factual / evidence gates

All on-screen facts re-checked against `evidence/bindings.json` (released engine output):

| On screen | Evidence |
| --- | --- |
| 16 MAR 2026, university decision due | `uic-ao-decision` `dueAt 2026-03-16`, `pending` |
| 30 MAR 2026, student hearing request due | `uic-student-request-hearing` `dueAt 2026-03-30`, `pending` |
| "Pending at 10 MAR evaluation" | `evaluationAt 2026-03-10T00:00:00Z`, both obligations pending |
| "or is due, whichever date is earlier." | verbatim span of the validated IV.A.4 quote |
| 3 business days, DELIBERATE TEST / FABRICATED PROPOSAL, REJECTED | `uic-fabricated-expedited-decision` in `rejected`, absent from `validated` |
| "The two supported deadlines remain." | `validated` = `uic-ao-decision`, `uic-student-request-hearing` |
| 18 MAR 2026 institution missed | forecast `through-institution-deadline`, `NO_NEW_EVENTS` |
| 02 APR 2026 both missed | forecast `through-student-deadline`, `NO_NEW_EVENTS`; institution remains missed |
| 211 tests · 32 benchmark properties · 5 institutions | `tests 211/211/0`, `benchTotal 32`, 5 institutions |
| v1.0.1-competition · d9c9f6c | release provenance |

Truth boundaries confirmed present and legible in the render:

- `UIC / SYNTHETIC CASE` in the header on every non-end-card frame.
- `Synthetic case · standard timing assumed` and `No remedy or outcome inferred.` in the footer from
  12.5 s onward, and repeated on the end card.
- `NO_NEW_EVENTS / SIMULATION` plus "The procedure is evaluated forward. No prediction of anyone's
  decision." throughout the forecast; the scenario dates are labelled `SCENARIO EVALUATION DATE`, not
  presented as new deadlines or observed events.
- "MISSED under this scenario" — never an unqualified missed-deadline claim.
- The film **never** labels the UIC result NONCONFORMANT; it reports obligations and deadlines only.
- "Designed checks. No accuracy score." on the end card.
- "Not legal advice. No appeal drafting or filing." on the end card.
- The Trace is labelled `Editorial view of the released exported Trace` — not a product frontend.
- Earlier-of semantics preserved: the verbatim source quote is shown, and the derived caption reads
  "Derived from the university's due date" rather than reducing the rule to due-date-only.
- CWRU is not included; its evidence stays in the package unmixed.
- No university endorsement, no private student data, no fabricated Grok output, policy text,
  terminal result, date, hash, engine state or product UI.

## Privacy result

**Pass.** Dense frame scan of the Grok window (above) plus a full-film sweep found no account
identity, credential, token, path, private material or unrelated content in any frame.

## Mobile readability result

**Pass.** Reviewed at 390 px feed width (`qa/mobile-390.png`) across ten representative frames. Every
consequential element stays legible: the hook, the Grok label and Bot identity, the verified excerpt,
both deadline dates, DELIBERATE TEST / FABRICATED PROPOSAL, REJECTED, "No executable rule. The two
supported deadlines remain.", NO_NEW_EVENTS, the scenario dates, "MISSED under this scenario", the
Trace rows, and both footer caveats. The PDF page crop is contextual provenance only; its verified
excerpt is restated in large type directly above it with "Exact excerpt from the captured UIC PDF,
page 5", so no consequential fact depends on reading the small page text.

## Complete-film watch result

**Pass.** Reviewed at full resolution across the entire 62 s and around every cut
(`qa/final-full.png`, `qa/final-transitions.png`, `qa/final-check2.png`, `qa/final-check3.png`,
`qa/final-check4.png`), then again muted at 390 px.

- Hook is comprehensible on frame 0; no dead intro.
- The UIC causal chain reads as one continuous sequence: recorded Grok result → captured PDF →
  verified quote → institution's deadline → student anchor → rejection → forecast → Trace. The two
  deadline objects persist and move through all four states rather than being redrawn per slide.
- The trust-boundary moment reads correctly: the proposal is labelled a deliberate fabricated test
  before it is shown, the quote-not-found check visibly causes REJECTED, and "No executable rule"
  follows with the two supported deadlines retained above it.
- Forecast reads as procedural simulation, not behavioural prediction.
- Trace reads as a reviewable record with its frame, evidence rows and provenance caveats.
- End card holds complete and still to the last frame; no fade to black.
- `blackdetect` reports no black or blank frames in either file.

## Every change made after SAFE

All corrections are objective implementation defects. No concept, narrative, palette, copy, shot
order or design system was changed. There is no V3.

1. **Blank first frame.** The hook faded in from opacity 0 over frames 0–10, so frame 0 — the feed
   thumbnail — was empty apart from the header rule. The hook is now fully visible on frame 0; its
   internal staggered reveals and its exit are unchanged.
2. **Superimposed headings at every block boundary.** Astra's `between()` windows overlapped, so for
   ~0.3 s at each cut two full-opacity text layouts sharing the same baselines rendered on top of one
   another ("Sfalltowwithhthescase."). Confirmed at 12.15, 12.3, 12.5, 19.2, 29.1, 36.1 and 44.1 s in
   SAFE. Added a `seg()` helper that sequences each transition with a short 0.08 s overlap, so no
   frame carries two legible headings and no frame is empty. Cut positions and hold lengths unchanged.
3. **Blank frames at 54.0 s.** The Trace had faded out before the end card began fading in, leaving
   several frames of bare paper. The end card now dissolves in from 53.8 s, covering the Trace exit.
4. **Caption collision during the clock compaction.** While the two deadline blocks converged at
   29 s, "Pending at 10 MAR evaluation" rendered on top of "STUDENT / HEARING REQUEST DUE",
   producing "Pending at 10STUDENTI/HEARING". Because the easing is front-loaded, a wall-clock fade
   was not enough; the caption opacity is now tied to the move itself (`fall(compact)`, `fall(trace)`)
   so captions clear as soon as the blocks start moving and return once they have settled. This also
   guarantees a status caption is never adjacent to the other object's date.
5. **Rejection content arriving mid-move.** "DELIBERATE TEST / FABRICATED PROPOSAL" landed on the
   still-settling 30 MAR date. Its entry moved from 29.12 s to 29.45 s, after the clocks settle.
6. **Forecast crowding** (Astra's own flagged, unverified item 6). At 36–44 s the institution's
   "MISSED under this scenario" sat 18 px above "STUDENT / HEARING REQUEST DUE", with the dependency
   rail running through the junction — the caption could be misread as belonging to the wrong date, a
   factual-legibility risk. Forecast offsets changed from `+160 / +360` to `+90 / +350` and the
   scenario block from `top:720` to `top:730`, giving 78 px and 48 px of separation. Trace offsets
   were adjusted from `-85 / -110` to `-15 / -100` so the already-verified Trace positions (415 / 590)
   are bit-for-bit unchanged. The early and compact states are unchanged.
7. **Invisible Trace frame** (Astra's flagged item 5). The border used `zIndex:-1` and rendered behind
   the parent background, so the authored "reviewable record" frame never appeared. Removed the
   negative z-index; the frame now encloses the deadline rows and evidence rows as designed.
8. **Encoding.** FINAL is rendered with PNG intermediates at CRF 18 — the project's own
   `remotion.config.ts` settings, which Astra's CLI flags (`--image-format=jpeg --crf=20`) had
   overridden. Flat typography and 2-3 px rules are exactly where JPEG intermediates cost most.
9. **Container.** The empty AAC track was stripped and full BT.709 VUI written by stream copy, with
   `+faststart`. The video bitstream is the original CRF 18 encode, unmodified. Duration is now
   exactly 62.000000 s.

Verified after every change: `tsc --noEmit` exit 0, then a fresh full render and a fresh frame sweep.

## Remaining material submission risk

1. **G02-equivalent nuance — the Bot's claim vs independently verified execution.** The Grok footage
   is genuine and its content matches the released engine analysis exactly. However, the Bot's
   attached Markdown/JSON Trace files were never downloaded or independently checked (the desktop
   showed two `Image unavailable` tiles). The film handles this correctly — it labels the footage
   `RECORDED RESULT`, states `released engine evidence follows`, and binds every computed fact to the
   released analysis rather than to the Bot's assertion — but a judge who assumes same-run attachment
   verification would be assuming more than the evidence supports. This is disclosed, not hidden.
2. **Recorded, not live.** The capture shows scrolling through an already-completed response, so it
   does not evidence real-time inference latency. The `RECORDED RESULT` label carries this.
3. **Launcher-script disclosure is on screen.** The Bot's note that auto-review would not bind the
   direct package-tool commands, and that the same approved workflow ran via a launcher script,
   is visible in the footage. Retained deliberately; a viewer may read it as friction in the
   integration.
4. **Not produced, by instruction:** poster, 16:9, narration, music, LinkedIn copy, Typeform,
   publication. None is required for the MP4 deliverable.

No blocker. `RECOURSE_V2_FINAL.mp4` is complete and passes QA.
