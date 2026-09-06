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
| **0:30–0:42** | Split view: the model proposes three rules. Two resolve to verbatim spans, highlighted in the open PDF. The third — a made-up "expedited decision within three (3) business days" — is rejected: `quoted text not found verbatim in captured source`. | "Every rule has to be a quote the engine can find, character for character, in the document it fetched. A confident paraphrase is not a rule." |
| **0:42–0:58** | The two obligations render side by side: **institution** `uic-ao-decision` due **2026-03-16**; **student** `uic-student-request-hearing` due **2026-03-30**. Cursor highlights the source clause in the PDF: *"…is received by the Grievant, or is due, whichever date is earlier."* | "Here's what the student couldn't see. Their appeal window doesn't start when a decision arrives — it starts when the decision was **due**. The university's silence didn't pause their clock. It started it." |
| **0:58–1:10** | Forecast output: `2026-03-18 → NEW_DEVIATION_DETECTED: uic-ao-decision pending → missed`. Then `2026-04-02 → uic-student-request-hearing pending → missed`. | "And the university's own deadline was missed on March 16th. That's not a prediction about what they'll do — it's what the procedure they published already implies." |
| **1:10–1:22** | `recourse trace` opens the Markdown Recourse Trace. Scroll past: source hashes → validated claims with quotes → the refused claim → the conformance finding → **What could not be determined**. | "It ends as a record, not an answer. Every source, every quote, every refusal, and an explicit list of what it *couldn't* determine — for a student to hand to an advisor." |
| **1:22–1:30** | Black card: **Grok discovers, reads, proposes, explains. The deterministic engine validates and evaluates.** Below: *Students have deadlines. Universities do too.* | "The model is treated as an untrusted proposer. That's the whole design." |

**On the fabricated rule, specifically:** the invented figure must be one the source genuinely does
not contain. **Do not use "ten business days" for UIC.** UIC's procedure really does impose a
10-day institutional deadline ("AO renders the decision within 10 days of receipt of the Academic
Grievance", with the document defining days as business days), so presenting that as a fabrication
would itself be the false claim. `examples/uic-grievance.json` therefore ships a third proposal
asserting an "expedited decision within three (3) business days" — a figure that appears nowhere in
the document, harmless if anyone repeats it, and verified rejected on a live run before this was
written.

**Optional 10-second alternate ending** (if the CWRU case is the stronger hook for the audience) —
run `examples/cwru-formal-hearing-waiver-ruled-out.json`, where the record affirmatively establishes
that no waiver was given:
`cwru-hearing-notice-lead-time → NONCONFORMANT — "hearing_held" occurred 2026-03-23, before the
minimum 5 business days from "hearing_notice_sent" (2026-03-20) had elapsed (required on or after
2026-03-27)`.

**Do not show the CWRU notice rule as an unqualified violation.** CWRU's own text attaches a waiver
to that provision, so on the default input (`examples/cwru-formal-hearing.json`, where the record
says nothing about a waiver) the correct finding is `UNDETERMINED` with the exception `UNRESOLVED`.
The clean, unqualified `NONCONFORMANT` in that procedure is the **relevant-information** rule, which
is a separate list item the waiver sentence does not reach. Lead with that one, or with the
waiver-ruled-out input above. Never describe the CWRU notice requirement as non-waivable.

**Optional 15-second beat on the deontic gate** (the strongest single refusal in the suite, and it
uses a real document): Minnesota's complaint guidance says "The Dean's decision should follow
promptly on receipt of the panel's recommendation, within 10 business days." Encoded as a `MUST`,
with a verbatim-correct quote and the right source, it is **rejected** on the evidence alone —
`deontic force 'MUST' is refused: the verified warrant span carries advisory modality and no binding
modality`. See `npm run bench`, Minnesota row 4.

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
> hashed itself. No verbatim span, no rule — and a verbatim span still isn't enough to make a rule
> binding. Quote a sentence that says a decision "should follow promptly, within 10 business days"
> and encode it as a hard deadline, and it refuses: advisory language cannot become an obligation.
>
> — It reports what it can't decide. Case Western requires five business days' notice before a
> conduct hearing — and says in the next sentence that a respondent may waive that notice. If the
> record doesn't say whether a waiver was given, Recourse returns UNDETERMINED, not a violation. A
> confident violation finding that turns out to have been waived doesn't just fail; it discredits
> everything else in the same record.
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
> It does not write your appeal. Some institutions prohibit or discourage AI-authored appeal content
> outright — that's the one place a language model can actively work against you.
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
- [ ] **Fabricated-rule check**: the invented figure shown on screen is genuinely absent from the
      source, re-verified on the day of recording. Never "ten business days" for UIC.
- [ ] **Waiver check**: the CWRU notice requirement is never described as non-waivable, and any
      NONCONFORMANT notice finding shown on screen comes from the waiver-ruled-out input.

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
| A binding force (MUST/SHALL) is refused when the cited span's only modality is advisory, and held for review when the span has no modal verb at all | `src/validation/deonticSupport.ts`; `test/deonticSupport.test.ts`; `bench/cases/umn-guidance-not-binding.ts`, `buffalo-actor-chain.ts` |
| A second verified quote (`forceEvidence`) may supply the binding provision, is checked to the identical standard, and cannot rescue an advisory primary span | `test/deonticSupport.test.ts`; `bench/cases/uic-grievance.ts` |
| A requirement the source itself makes waivable resolves to UNDETERMINED while the waiver is unresolved, EXCEPTION_APPLIES when a waiver is recorded, and NONCONFORMANT only once the record rules the waiver out | `src/conformance/conformanceChecker.ts`; `test/exceptions.test.ts`; `bench/cases/cwru-hearing-notice.ts` |
| An unverifiable or inferred waiver is rejected rather than dropped back to "no exception" | `test/exceptions.test.ts`; `bench/cases/cwru-hearing-notice.ts` (`cwru-fabricated-waiver-rejected`) |
| The CWRU five-business-day notice case resolves NONCONFORMANT with a computed boundary date **once the record rules the stated waiver out**; UNDETERMINED while it is unresolved | `bench/cases/cwru-hearing-notice.ts`; `examples/traces/cwru-formal-hearing-waiver-ruled-out.trace.md`, `examples/traces/cwru-formal-hearing.trace.md` |
| The CWRU relevant-information lead time is a separate provision the waiver does not reach, and resolves NONCONFORMANT unqualified | `bench/cases/cwru-hearing-notice.ts` (`cwru-information-nonconformant`) |
| Forecasting reuses the same deadline/conformance engines and never mutates the real log | `test/forecast.test.ts` (purity test) |
| Forecast scenarios cannot contain engine-invented events | `src/forecast/forecast.ts` has no CaseEvent constructor; `test/forecast.test.ts` |
| The Recourse Trace carries sources, hashes, warrants, findings, refusals, and uncertainty | `test/recourseTrace.test.ts` |
| The Trace's content hash is deterministic for a fixed captured analysis: identical captured sources, case record and evaluation instant always produce the identical hash | `test/recourseTrace.test.ts` |
| The human-facing Trace leads with the governing procedure, the findings, both parties' deadlines, what could not be determined, and an explicit "no remedy or outcome is inferred" — with every hash, span and refused claim kept in full below a divider | `test/recourseTrace.test.ts` (ordering test); `examples/traces/*.trace.md` |
| Source drift detects changed / extractor-drifted / unavailable sources and marks dependent claims stale without re-deriving them | `test/sourceDrift.test.ts` |
| RecourseBench: 32 properties across five real institutions | `npm run bench`; `test/bench.test.ts` |
| The whole chain runs from one CLI command with no glue code | `src/cli/analyzeCase.ts`; `test/analyzeCase.test.ts` |

### IMPLEMENTED, NOT YET GROK-TESTED

Works, and has been run end-to-end from the CLI — but not yet driven by a live Grok Bot.

| Claim | Status |
| --- | --- |
| A Grok Bot can drive the full chain as a subprocess with no TypeScript glue | Contract specified in `engine/GROK_HANDOFF.md` and exercised via CLI with real inputs; not yet run from a deployed Bot. |
| The Grok Skill instructions in `skills/` produce well-formed `analyze` input | Written against the current contract; not yet executed by a Bot. |
| `recourse drift` as a scheduled routine | Two different things, kept apart on purpose. The **engine primitive** is implemented, tested (`test/sourceDrift.test.ts`) and CLI-runnable with no model in the loop; it has been run live against the CWRU page (result: UNCHANGED). The **Grok Routine** that would run it on a schedule is specified in `routines/policy-drift.md` and **has never been executed**. Nothing in this repository is evidence of a scheduled run. |

### PLANNED / DO NOT CLAIM

Not implemented. These must not appear in the video, the post, or the Bot description.

| Not claimed | Why |
| --- | --- |
| Detecting that a *rule* changed (as opposed to the document changing) | Drift reports a hash difference and requires revalidation. Inferring semantic change from a hash would be exactly the confident inference this system refuses. |
| Automatic revalidation after drift | Revalidation means re-running the analysis and a human reviewing it. |
| General natural-language entailment between a source span and a proposed rule | The deontic-support gate is a lexical modality check over the cited sentences, and only for the binding/advisory dimension. It cannot tell whether a binding sentence in a quoted passage is about the same obligation the rule encodes. Stated in the module, in `engine/README.md`, and here. |
| Discovering exceptions a proposer did not propose | An exception must be proposed and quoted like any other claim. Recourse does not scan a document for waivers on its own, so a requirement with an unmodelled exception can still produce a determined finding. |
| A bare `traceHash` match across two independent live runs | The hash is content-addressed over one captured analysis and covers each capture's `retrievedAt`. Two live recaptures of the same unchanged page produce different hashes. `recourse drift` is what compares a pinned trace to the live sources. |
| Academic-day calendars (session breaks, reading days, finals) | `FixedHolidayCalendar` takes a fixed holiday list. Noted in `bench/cases/buffalo-actor-chain.ts`. |
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
> held on March 23rd, and was never asked to waive the notice period. Using the public Formal Hearing
> Process procedure, check whether the notice period conforms. Use synthetic dates only.

(If the student's account does not settle the waiver question, the correct answer is UNDETERMINED
with the exception unresolved — that is a good outcome to demonstrate, not one to prompt around.)

**Expected public output format:** the response shape in `skills/resolve-recourse-case.md` Step 7 —
governing procedure; what it required; what actually happened; the finding
(CONFORMANT / NONCONFORMANT / UNDETERMINED / EXCEPTION_APPLIES, with any exception state); both
parties' deadlines; what could not be determined; the exact quoted evidence and its URL; and an
explicit statement that no remedy or outcome is inferred. Then the Recourse Trace itself, whole.

**Approval and safety boundaries for the Bot:**

- Public, unauthenticated URLs only.
- Synthetic or student-supplied case facts only; no personal identifiers.
- Never file, submit, or send anything to an institution.
- Never present `UNDETERMINED`, `needsReview`, or a blocked authority result as a conclusion.
- Never re-word a quote to make it validate.
- Never upgrade advisory language to a binding requirement.
- Never report a violation while an exception the source states is unresolved.
- Never write the student's appeal narrative.
