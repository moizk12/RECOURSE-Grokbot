# DEMO_OPTIONS.md

Three 60–90 second demo concepts for the Grok Bot Student Build Challenge submission, each using a synthetic student and a real public policy from `benchmarks/`. Ranked below by emotional impact, technical depth, reliability, and ease of recording — with an overall recommendation at the end.

---

## Option A — "No, and here's why" (the refusal demo)

**Script (built on `benchmarks/case-02-no-valid-ground.md`):**
1. (0:00–0:15) Student types the UC Merced dismissal scenario into the Bot: bad grades, blames inconsistent grading across sections, wants to appeal.
2. (0:15–0:45) Screen shows Recourse fetching the actual UC Merced appeals page live, extracting the five enumerated grounds on screen, and returning: **INELIGIBLE** — with the exact quoted grounds shown side-by-side against the student's stated facts, visibly not matching.
3. (0:45–1:00) Cut to a second, contrasting beat: same Bot, a different synthetic case (`case-01` or `case-06`) where it *does* proceed — to show this isn't a Bot that just says no to everything, it's one that says no *specifically* when the facts say no.
4. (1:00–1:15) Closing card: "An AI appeal writer would have written this appeal anyway. Recourse won't — because the policy says it can't win, and burning your one shot on a loss you could have avoided is the actual harm."

**Emotional impact:** High. "The AI tells you the hard truth instead of flattering you" is a strong, unusual, memorable hook — it directly inverts the expected AI-product demo (AI says yes, generates something) in a way judges will remember.
**Technical depth shown:** Medium-high — live policy fetch, structured ground-matching against an enumerated list, a real refusal state.
**Reliability:** High — this is a deterministic, closed-list match; low risk of the live demo behaving unpredictably, as long as the fetch succeeds on the day (have a cached fallback recording of the same run, timestamped, in case live fetch is flaky during recording).
**Ease of recording:** High — single scripted interaction, no multi-day state needed.

---

## Option B — "The institution has a clock too" (the symmetric-obligation demo)

**Script (built on `benchmarks/case-04-institution-deadline.md` and the `case-watch` Routine):**
1. (0:00–0:20) Student describes filing a formal grievance appeal weeks ago and hearing nothing back.
2. (0:20–0:50) Recourse pulls up the case file on screen — not from scratch, but as a *pre-seeded, already-open* case with a realistic history (student obligation met weeks ago, shown as `status: met`) — and shows the institution's own 30-calendar-day response obligation, computed from the recorded receipt date, now overdue.
3. (0:50–1:10) Show the `case-watch` Routine log entry that caught this automatically, unprompted, days before the student even asked — framed as "this already happened in the background."
4. (1:10–1:25) Closing card: "Every tool tracks your deadline. Nothing tracks theirs. Recourse does — and it does it without you having to ask."

**Emotional impact:** High, in a different register than Option A — less "tough love," more "someone is finally on my side against an opaque institution." Strong for viewers who've personally experienced bureaucratic silence.
**Technical depth shown:** Highest of the three — this is the one that actually shows the Routine, the persistent monitoring, and the dual-obligation model that most differentiates Recourse from Category 2 competitors (`COMPETITIVE_REVIEW.md`).
**Reliability:** Medium — requires either a genuinely pre-seeded case file with a believable multi-week history (easy, since it's synthetic data prepared in advance) or an actually-running Routine over real elapsed time (hard to record live in 90 seconds; don't attempt this — pre-seed it).
**Ease of recording:** Medium — needs setup work beforehand (a realistic-looking case history) rather than a single live interaction, but nothing that requires real elapsed time during recording itself.

---

## Option C — "The trap you'd never see coming" (the business-day edge case demo)

**Script (built on `benchmarks/case-09-business-day-edge-case.md`, Kent State):**
1. (0:00–0:20) Student says they got a letter right before winter break with "10 days to escalate," asks when it's due, maybe even suggests a guess ("so like, early January?").
2. (0:20–0:55) Split screen: a naive calendar-day countdown ticking down to early January on one side, versus Recourse's actual computed answer on the other — pulling the exact Kent State policy language ("days" = in-session weekdays only, excluding exam week) and landing on a due date weeks later, after spring semester resumes.
3. (0:55–1:15) Closing card: "A wrong guess here doesn't feel wrong. It feels like a reasonable deadline — until it's the wrong one. This is the kind of failure that never makes headlines, because the student never finds out they had more time, or less."

**Emotional impact:** Medium — more intellectually satisfying ("huh, I wouldn't have thought of that") than emotionally gripping; works better for a technically-literate judge panel than a general audience.
**Technical depth shown:** High, but narrow — showcases `business_day_rules` and date-math rigor specifically, less of the overall system than Option B.
**Reliability:** High — pure computation, no live fetch dependency if the policy is pre-cached (recommended given this project's own fetch-access issues during research).
**Ease of recording:** Highest of the three — a single deterministic calculation with a clean visual (split-screen countdown), no multi-turn setup needed.

---

## Ranking and recommendation

| | Emotional impact | Technical depth | Reliability | Ease of recording |
|---|---|---|---|---|
| A — Refusal | 1st | 2nd | 1st (tie) | 1st |
| B — Symmetric clock | 1st (tie) | 1st | 3rd | 3rd |
| C — Business-day trap | 3rd | 2nd (tie) | 1st (tie) | 1st (tie) |

**Recommendation: lead with Option A.** It's the demo that most directly embodies the thesis in `README.md` ("not an appeal-writing chatbot") in a single visual beat any judge will immediately understand, it's cheap and reliable to record, and its second beat (showing the Bot *does* proceed on a valid case) pre-empts the obvious objection that it's "just a tool that says no."

**If given a full 90 seconds and a second recording attempt is acceptable, splice A's first 45 seconds with B's back half** (the pre-seeded institution-timeout reveal) — this shows both defining properties (refuses when it should; tracks what nothing else tracks) without spending a full demo slot on either alone. This composite is riskier to script cleanly than running A alone, so treat it as the stretch goal, with a clean standalone Option A recording banked first as the fallback submission.
