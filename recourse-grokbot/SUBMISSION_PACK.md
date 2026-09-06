# Submission Pack

Everything needed to submit Recourse, and a ledger of exactly which claims are backed by tested
behaviour. Nothing here has been submitted, posted, or published — all outward actions are the
author's to take.

---

## A. Demo storyboard (60–90 seconds)

The demo has to make the differentiation *visible*. Anyone can say "it verifies sources." The demo
must show the engine refusing something, and show a number no chatbot would produce.

**Recording setup:** terminal on the left, the real policy PDF/page open on the right. Every date on
screen comes from a real command run, not a slide.

| Time | On screen | Voiceover |
| --- | --- | --- |
| **0:00–0:08** | A student's message: *"I filed an academic grievance at UIC on March 2nd. It's been three weeks and nobody has replied. Have I lost my appeal?"* | "Every university tells students their deadline. Almost none of them tell students the university has one too." |
| **0:08–0:18** | Grok finds the authoritative UIC Student Academic Grievance Procedures PDF. Terminal: `recourse analyze examples/uic-grievance.json`. Source line appears with the live URL, `sha256:3cfacf12…`, extractor `pdf-parse v2.4.5`. | "Grok finds the procedure. Recourse fetches it itself and hashes it — so every claim after this points at a specific document, not a memory of one." |
| **0:18–0:30** | `authority: APPLICABLE — uic-academic-grievance`. Then cut to the second run: same accurate quote, `decisionType: student_conduct_suspension` → `BLOCKED_SOURCE_UNAVAILABLE`, `0 rules compiled`. | "First it establishes which document actually governs *this* decision. Quote the right university's real policy for the wrong kind of decision and nothing compiles — the citation checks out, and it still refuses." |
| **0:30–0:42** | Split view: the model proposes two rules. One resolves to a verbatim span, highlighted in the open PDF. The other — a fabricated "ten business days" — is rejected: `quoted text not found verbatim in captured source`. | "Every rule has to be a quote the engine can find, character for character, in the document it fetched. A confident paraphrase is not a rule." |
| **0:42–0:58** | The two obligations render side by side: **institution** `uic-ao-decision` due **2026-03-16**; **student** `uic-student-request-hearing` due **2026-03-30**. Cursor highlights the source clause in the PDF: *"…is received by the Grievant, or is due, whichever date is earlier."* | "Here's what the student couldn't see. Their appeal window doesn't start when a decision arrives — it starts when the decision was **due**. The university's silence didn't pause their clock. It started it." |
| **0:58–1:10** | Forecast output: `2026-03-18 → NEW_DEVIATION_DETECTED: uic-ao-decision pending → missed`. Then `2026-04-02 → uic-student-request-hearing pending → missed`. | "And the university's own deadline was missed on March 16th. That's not a prediction about what they'll do — it's what the procedure they published already implies." |
| **1:10–1:22** | `recourse trace` opens the Markdown Recourse Trace. Scroll past: source hashes → validated claims with quotes → the refused claim → the conformance finding → **What could not be determined**. | "It ends as a record, not an answer. Every source, every quote, every refusal, and an explicit list of what it *couldn't* determine — for a student to hand to an advisor." |
| **1:22–1:30** | Black card: **Grok discovers, reads, proposes, explains. The deterministic engine validates and evaluates.** Below: *Students have deadlines. Universities do too.* | "The model is treated as an untrusted proposer. That's the whole design." |

**Optional 10-second alternate ending** (if the CWRU case is the stronger hook for the audience):
`cwru-hearing-notice-lead-time → NONCONFORMANT — "hearing_held" occurred 2026-03-23, before the
minimum 5 business days from "hearing_notice_sent" (2026-03-20) had elapsed (required on or after
2026-03-27)`.

**Do not show:** anything implying Recourse files an appeal, any real student data, any authenticated
system, or any claim from the ledger below marked *PLANNED / DO NOT CLAIM*.

---

## B. LinkedIn post draft

> I spent this term building something I wish had existed when a friend got a decision letter with a
> deadline buried in paragraph four.
>
> Here's the thing nobody tells students: universities publish procedures that bind them too. Response
> deadlines. Notice requirements. Minimum days between telling you about a hearing and holding it.
> Students get told their deadline. The institution's own deadlines sit in the same PDF and mostly
> go unchecked.
>
> So I built Recourse. It reads the procedure a university actually published, reconstructs what
> happened in a case, and checks whether the two match.
>
> It is not a policy chatbot. A chatbot tells you what the handbook says. Recourse does three things
> a chatbot structurally can't:
>
> — It works out which document *governs* your decision. Quote the right university's real policy for
> the wrong kind of decision and it compiles nothing.
> — Every rule has to be a quote it can find character-for-character in a document it fetched and
> hashed itself. No verbatim span, no rule.
> — It computes both clocks. On a real UIC grievance procedure, a synthetic student's appeal window
> resolved to a date even though no decision was ever received — because the policy says the window
> runs from when a decision is received *or is due, whichever is earlier*. The university's silence
> didn't pause that clock. It started it.
>
> The division of labour is the point. Grok discovers, reads, proposes and explains. A deterministic
> engine validates and evaluates. The model is an untrusted proposer, not a source of truth — it
> can't supply a hash, can't supply a text offset, and can't turn its own interpretation into an
> executable rule.
>
> It refuses a lot, deliberately. If two policies both claim to govern your case and nothing in
> either says which wins, it says so and stops. That's the honest answer.
>
> It does not write your appeal. Several universities penalise AI-authored appeal narrative — that's
> the one place a language model actively hurts you.
>
> Benchmarked against five real university procedures — UIC, Auburn, Case Western, Minnesota, and
> Buffalo — including a negative case: Minnesota's complaint guidance says in its own first paragraph
> that it "do[es] not establish procedural rights or impose obligations." Recourse has to read that
> and refuse to turn it into a deadline. It does.
>
> Bot template: [PLACEHOLDER — public Grok Bot template link]
> Code: [PLACEHOLDER — GitHub link]
>
> #GrokBotForStudents

**Notes before posting:** replace both placeholders. Do not add claims about judging, rankings, or
contest rules. Keep the "does not write your appeal" line — it is the clearest differentiator and it
is true.

---

## C. Submission checklist

- [ ] **Video** recorded per storyboard A. Every number on screen re-verified from a live run the day
      of recording (source hashes and `retrievedAt` change; the *dates* should not).
- [ ] **LinkedIn post** published with both placeholders replaced.
- [ ] **Public Bot template** created and its link live.
- [ ] **Hashtag** `#GrokBotForStudents` present in the post.
- [ ] **Typeform** submitted.
- [ ] **URLs / commit / tag verified**: repository public; `v1.0.0-competition` tag pushed and
      resolving; every URL in the post and video opens.
- [ ] **Privacy / secrets check**: no credentials, tokens, or `.env` in the repo; all case data
      synthetic; no DePaul or authenticated-system data anywhere.
- [ ] **Claims check**: every statement in the video and post traces to an *IMPLEMENTED + TESTED* row
      in ledger D.

---

## D. Claims ledger

The reason this section exists is to stop the demo from outrunning the code.

### IMPLEMENTED + TESTED

Backed by code in this repository and by tests that run in `npm test` / `npm run bench`.

| Claim | Evidence |
| --- | --- |
| Sources are fetched live, hashed at both raw-bytes and canonical-text level, with a versioned extractor | `src/warrant/acquireSource.ts`; `test/acquireSource.test.ts` |
| A rule requires a unique verbatim span in the captured source; zero matches rejected, multiple matches held for review | `src/warrant/resolveQuote.ts`; `test/rawProposal.test.ts`, `test/warrant.test.ts` |
| A model cannot supply a content hash or a character offset | No such field exists on any of the three raw-proposal types |
| Inferred claims are never auto-promoted, in any of the three layers | `test/warrant.test.ts`, `test/authority.test.ts`, `test/conformance.test.ts` |
| Source lineage is established only from quoted text, never from URL/domain/title | `src/authority/relationshipValidator.ts`; `test/authority.test.ts` |
| Competing sources with no validated relationship block **all** compilation | `test/analyzeCase.test.ts` ("unresolved authority blocks the entire executable layer") |
| An accurate quote from a source outside the resolved set never becomes an executable rule | `test/analyzeCase.test.ts` (both WRONG SOURCE tests) |
| A document stating it does not establish rights or impose obligations cannot govern | `bench/cases/umn-guidance-not-binding.ts` |
| `CLOSED` grounds require an affirmative exhaustiveness quote | `test/exhaustiveness.test.ts`; `bench/cases/auburn-appeal-grounds.ts` |
| Deadlines are computed deterministically in business or calendar days, from an explicit evaluation instant | `src/calendar/`; `test/businessDays.test.ts`, `test/evaluationTime.test.ts` |
| The UIC "received **or is due**, whichever is earlier" derived anchor | `test/derivedDeadlines.test.ts`; `bench/cases/uic-grievance.ts` |
| Both parties' clocks are tracked; institutional deadlines produce their own deviations | `test/dualClocks.test.ts`; `bench/cases/uic-grievance.ts` |
| Conformance fails closed: absence is UNDETERMINED until an observed event closes the window | `test/conformance.test.ts`; `bench/cases/cwru-hearing-notice.ts`, `buffalo-actor-chain.ts` |
| The CWRU five-business-day notice case resolves NONCONFORMANT with a computed boundary date | `bench/cases/cwru-hearing-notice.ts`; `examples/traces/cwru-formal-hearing.trace.md` |
| Forecasting reuses the same deadline/conformance engines and never mutates the real log | `test/forecast.test.ts` (purity test) |
| Forecast scenarios cannot contain engine-invented events | `src/forecast/forecast.ts` has no CaseEvent constructor; `test/forecast.test.ts` |
| The Recourse Trace carries sources, hashes, warrants, findings, refusals, and uncertainty, with a deterministic content hash | `test/recourseTrace.test.ts` (15 structural tests) |
| Source drift detects changed / extractor-drifted / unavailable sources and marks dependent claims stale without re-deriving them | `test/sourceDrift.test.ts` |
| RecourseBench: 28 properties across five real institutions | `npm run bench`; `test/bench.test.ts` |
| The whole chain runs from one CLI command with no glue code | `src/cli/analyzeCase.ts`; `test/analyzeCase.test.ts` |

### IMPLEMENTED, NOT YET GROK-TESTED

Works, and has been run end-to-end from the CLI — but not yet driven by a live Grok Bot.

| Claim | Status |
| --- | --- |
| A Grok Bot can drive the full chain as a subprocess with no TypeScript glue | Contract specified in `engine/GROK_HANDOFF.md` and exercised via CLI with real inputs; not yet run from a deployed Bot. |
| The Grok Skill instructions in `skills/` produce well-formed `analyze` input | Written against the current contract; not yet executed by a Bot. |
| `recourse drift` as a scheduled routine | Primitive implemented and run live against the CWRU page (result: UNCHANGED). **No scheduled run has been performed** — see `routines/policy-drift.md`. |

### PLANNED / DO NOT CLAIM

Not implemented. These must not appear in the video, the post, or the Bot description.

| Not claimed | Why |
| --- | --- |
| Detecting that a *rule* changed (as opposed to the document changing) | Drift reports a hash difference and requires revalidation. Inferring semantic change from a hash would be exactly the confident inference this system refuses. |
| Automatic revalidation after drift | Revalidation means re-running the analysis and a human reviewing it. |
| Detecting MUST asserted over SHOULD text via the warrant layer | A span check cannot catch modality drift; only the authority layer stops it. Recorded as a passing expectation in `bench/cases/umn-guidance-not-binding.ts` rather than hidden. |
| Academic-day calendars (session breaks, reading days, finals) | `FixedHolidayCalendar` takes a fixed holiday list. Noted in `bench/cases/buffalo-actor-chain.ts`. |
| Waiver semantics in conformance | CWRU's notice right is waivable by the respondent; the conformance IR has no waiver construct. Noted in the case file. |
| Any frontend, dashboard, or hosted service | Not built. CLI and library only. |
| Filing, submitting, or sending anything to an institution | Out of scope permanently. |
| Access to authenticated university systems, SIS, or portals | Out of scope permanently. |
| Legal advice, remedy prediction, or outcome prediction | Explicitly disclaimed on every Recourse Trace. |
| Any accuracy percentage or benchmark score | RecourseBench reports a matrix. A pass ratio over hand-encoded invariants is not a defensible metric, and a test asserts the report contains no percentage. |

---

## E. Bot description and starter prompts

**Bot description (short):**

> Recourse reconstructs the procedure your university published, reconstructs what happened in your
> case, and checks whether the two conform. It finds the governing policy, compiles only rules it can
> quote verbatim from the document it fetched, computes both your deadlines and the institution's,
> and produces a reviewable record. It does not write your appeal, does not give legal advice, and
> does not submit anything on your behalf.

**Starter prompt:**

> I got an adverse academic decision at [university]. Here's what happened and when: [dates and
> events, no personal identifiers]. Find the authoritative public procedure that governs this kind of
> decision, run it through Recourse, and show me the deadlines on both sides and anything that
> doesn't conform.

**Second-case test prompt (safe, different institution and shape):**

> A student at Case Western Reserve was told on March 20th that their formal conduct hearing would be
> held on March 23rd. Using the public Formal Hearing Process procedure, check whether the notice
> period conforms. Use synthetic dates only.

**Expected public output format:** a Recourse Trace — governing source with hash, validated claims
with their quotes, refused claims with reasons, obligations with computed due dates, conformance
findings, forecast, and an explicit "what could not be determined" section.

**Approval and safety boundaries for the Bot:**

- Public, unauthenticated URLs only.
- Synthetic or student-supplied case facts only; no personal identifiers.
- Never file, submit, or send anything to an institution.
- Never present `UNDETERMINED`, `needsReview`, or a blocked authority result as a conclusion.
- Never re-word a quote to make it validate.
- Never write the student's appeal narrative.
