# V2 — COMPLETE / DELIVERED

Claude took over Astra's preserved production state, finished the implementation, rendered, ran full
QA on the actual MP4, corrected objective defects, and delivered. No Astra invocation, no OpenAI
Codex/Work, no OpenAI credits used.

## Deliverables (both exist)

- FINAL: `C:\Dev\recourse-video\deliverables\RECOURSE_V2_FINAL.mp4`
  sha256 `116e8d71f6c0db6514b78e28a21cbbeac141af3c07945c8393eaec5df49e74c4`
  1080x1350 / 30fps / 62.000000s / 1860 decoded frames / H.264 yuv420p / BT.709 / faststart / no audio
- SAFE (preserved, pre-correction): `C:\Dev\recourse-video\deliverables\RECOURSE_V2_SAFE.mp4`
  sha256 `91651a61fca6951ccdeb3dcbf21aa2fddaa0313bb00fdd526b1c03dbf00f20eb`
  Rendered with Astra's exact command. Had the defects listed in the acceptance record. Not identical
  to FINAL.
- Acceptance record: `C:\Dev\recourse-video\qa\V2_ACCEPTANCE.md`
- QA sheets: `qa/final-full.png`, `qa/final-transitions.png`, `qa/final-check2.png`,
  `qa/final-check3.png`, `qa/final-check4.png`, `qa/grok-privacy-scan.png`, `qa/mobile-390.png`,
  and per-frame stills in `qa/v2final/`.

## Source of truth

- Working source: `C:\Dev\recoursegrokbot\recourse-video-v2\src\Film.tsx` (corrected version).
- Portable copy synced to the same corrected source: `C:\Dev\recourse-video\V2_CLAUDE_PACKAGE\src\`.
- Genuine Grok assets unchanged: `V2_CLAUDE_PACKAGE\evidence\GROK_ORIGINAL.mkv`,
  `...\public\grok-result.mp4`, `...\evidence\grok-observed-result.txt`.
- Factual bindings: `evidence/bindings.json`; the composition throws before rendering if gate G01 or
  G03 is not PASSED. Dates are computed from bindings at render time, never typed.

## Release basis

`v1.0.1-competition` / `d9c9f6c347b880408553d88e24420ce6108d62b6`.

## Gate status

- Release / factual (G01, G03): PASSED. Every on-screen date, status, count and tag re-checked
  against the released engine evidence.
- Genuine Grok footage: present and verified authentic; Bot identity readable; no private material.
  The Bot's attached Trace files were never independently downloaded or checked, so the film
  distinguishes the recorded Bot result from independently verified engine execution and binds all
  computed facts to the released analysis. No same-run attachment/hash verification is claimed.
- Privacy: pass. Mobile readability at 390px: pass. Complete-film watch: pass.
  `blackdetect`: no black or blank frames.

## To reproduce

```powershell
Set-Location C:\Dev\recoursegrokbot\recourse-video-v2
node node_modules\typescript\bin\tsc --noEmit
node node_modules\@remotion\cli\remotion-cli.js render RECOURSE-V2 C:\Dev\recourse-video\deliverables\_raw.mp4 --browser-executable="C:\Program Files\Google\Chrome\Application\chrome.exe" --concurrency=3 --crf=18 --image-format=png --color-space=bt709
ffmpeg -i _raw.mp4 -map 0:v:0 -an -c:v copy -bsf:v h264_metadata=video_full_range_flag=0:colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1 -movflags +faststart RECOURSE_V2_FINAL.mp4
```

PNG intermediates at CRF 18 are the project's own `remotion.config.ts` settings; Astra's earlier
`--image-format=jpeg --crf=20` flags overrode them and cost quality on flat typography and thin rules.
The remux strips the empty AAC track Remotion emits and writes the full BT.709 VUI; the video
bitstream is the original encode, unmodified.

## Corrections applied after SAFE

Blank first frame; superimposed headings at every block boundary; blank frames at 54.0s; caption
collision during the clock compaction; rejection content arriving mid-move; forecast crowding
(Astra's flagged item 6); invisible Trace border (Astra's flagged item 5); JPEG->PNG intermediates;
empty audio track and colour tagging. Full detail and rationale in `qa/V2_ACCEPTANCE.md`.

## Not done, by instruction

Poster, 16:9, narration, music, LinkedIn copy, Typeform, publication or submission. None is needed
for the MP4 deliverable.

## Remaining risk

None blocking. See "Remaining material submission risk" in `qa/V2_ACCEPTANCE.md` — chiefly that the
Grok footage is a recorded result whose attached Trace files were never independently verified, which
the film discloses rather than overclaims.
