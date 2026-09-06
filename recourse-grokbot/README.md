# Recourse

### Students have deadlines. Universities do too.

Recourse reconstructs the procedure an institution published, reconstructs what actually happened in
a student's case, and checks whether the two conform.

It is not a policy chatbot. A chatbot tells you what a handbook says. Recourse determines which
document *governs* your decision, compiles only the rules that document actually states, replays your
case against them, and produces a record someone else can check.

**The LLM is an untrusted proposer, not a source of truth.**

---

## The trust pipeline

```
DISCOVER / AUTHORITY  →  COMPILE  →  VERIFY  →  TWIN  →  CONFORM  →  FORECAST  →  PROVE  →  WATCH
```

| Stage | What happens | Where |
| --- | --- | --- |
| **DISCOVER / AUTHORITY** | Sources are fetched and hashed. Lineage between them (`GOVERNS`, `IMPLEMENTS`, `EXTENDS`, `SUPERSEDES`, `GUIDANCE_FOR`) is established only from quoted text. One governing source is resolved — or the engine refuses to pick. | `src/warrant/acquireSource.ts`, `src/authority/` |
| **COMPILE** | Proposed rules are turned into candidate obligations, grounds, and constraints. | `src/warrant/rawProposal.ts`, `src/conformance/` |
| **VERIFY** | Every claim is checked against a unique verbatim span in the captured source, and gated on the resolved authority. Inferred claims are never auto-promoted. | `src/warrant/`, `src/authority/authorityGate.ts` |
| **TWIN** | The case's append-only event trace is replayed against the validated procedure. Deadlines are computed, never estimated. | `src/case/`, `src/calendar/` |
| **CONFORM** | Observed process is compared to expected process: CONFORMANT / NONCONFORMANT / UNDETERMINED. | `src/conformance/conformanceChecker.ts` |
| **FORECAST** | The same validated procedure is re-evaluated at explicit future instants, under scenarios the caller states. | `src/forecast/` |
| **PROVE** | One analysis becomes a Recourse Trace: sources, hashes, warrants, findings, refusals, uncertainty. | `src/trace/` |
| **WATCH** | Pinned sources are re-acquired; changed ones mark their dependent conclusions stale. | `src/drift/` |

Every stage above is implemented and tested in this repository. Nothing in this diagram is aspirational.

---

## Three ways a model gets a student's procedure wrong

Recourse has a distinct, deterministic guard for each.

### 1. Wrong source

A model quotes a real university policy, accurately — and it is the wrong document. The campus-wide
policy instead of the college supplement. The grievance procedure instead of the conduct code. Last
year's version.

A span check cannot catch this: the quote is genuinely there. **Authority resolution** can. Sources
declare what they claim to be applicable to; lineage between them is established only from quoted
text, never from a URL, a domain, or a page title. If two sources claim the same scope with no
validated relationship between them, the engine returns `BLOCKED_SOURCE_CONFLICT` and **no rule of
any kind compiles** — however well quoted.

### 2. Wrong interpretation

A model reads a list of appeal grounds and concludes it is exhaustive, because it did not say "or
other good cause". It reads "should" and writes "must".

**Warrant validation** requires a unique verbatim span in a content-hashed capture before a claim
becomes executable, and it separates what a source *states* from what a reader *inferred*. An
inferred claim goes to human review even when its evidence verifies exactly. `CLOSED` on a list of
grounds requires a quote affirmatively saying the list is closed; absence of an escape clause is not
evidence.

### 3. Wrong process

Everyone checks whether the student met their deadline. Far fewer check whether the university met
its own.

**Conformance checking** compares the validated expected procedure against the observed event trace,
for every actor. It fails closed: a required step that has not happened is `UNDETERMINED`, not a
violation, until an observed event actually closes the window.

---

## What it looks like

A synthetic student files an academic grievance at UIC on 2 March 2026. Nothing happens after that.
Run against the live UIC policy PDF:

```bash
cd recourse-grokbot/engine && npm ci
node src/cli/index.ts analyze examples/uic-grievance.json
```

The command prints JSON; summarised, it says:

```
authority: APPLICABLE — uic-academic-grievance
source:    oae.uic.edu/.../UIC_Student_Academic_Grievance_Procedures-and-Forms_FINAL_Sept-2019.pdf
           sha256:3cfacf12…  extractor pdf-parse v2.4.5

obligation  uic-ao-decision              institution   due 2026-03-16   pending
obligation  uic-student-request-hearing  student       due 2026-03-30   pending

forecast  2026-03-18  NEW_DEVIATION_DETECTED  uic-ao-decision: pending → missed
forecast  2026-04-02  NEW_DEVIATION_DETECTED  uic-student-request-hearing: pending → missed
```

The second line is the one that matters. The student's clock resolves to a real date **even though
no decision was ever received**, because the source says the appeal window runs from the date a
decision is received *"or is due, whichever date is earlier"* — so institutional silence does not
freeze the student's next-stage deadline. Both dates are computed in business days, because the same
document defines its own day unit.

`recourse trace examples/uic-grievance.json` renders the whole thing as a record a student can hand
to an advisor. See `engine/examples/traces/`.

---

## RecourseBench

Five current, authoritative, public university procedures, each chosen to stress a different semantic
failure mode. Sources are captured live through the engine's own acquisition path and pinned, so runs
are deterministic. All student data is synthetic.

| Institution | Procedure | What it tests |
| --- | --- | --- |
| University of Illinois Chicago | Academic Grievance | Two-sided clocks; the derived "received or due, whichever is earlier" anchor |
| Auburn University | Academic Integrity appeal | Closed grounds only where the source says "may only be considered if"; five business days |
| Case Western Reserve | Formal Hearing Process | Minimum notice lead time; deterministic NONCONFORMANT |
| University of Minnesota | Student complaint guidance | **Negative test.** The document says it "do[es] not establish procedural rights or impose obligations" — Recourse must not compile it into either |
| University at Buffalo | Undergraduate Academic Integrity | Actor-chained process; the student's clock is anchored on the instructor's step |

```bash
npm run bench
```

28 properties, reported as a matrix of expected-vs-actual with the source URL on every row. **No
accuracy percentage** — these are invariants over hand-encoded cases, not a labelled dataset, and a
pass ratio would dress a design decision up as a measurement.

---

## Scope, and what Recourse will not do

- **It does not write the student's appeal.** Several institutions penalise AI-authored appeal
  narrative; that is the one place a language model actively damages a student's case.
- **It does not infer a remedy, a legal entitlement, guilt, innocence, or a guaranteed outcome.**
  Every Recourse Trace states this on its face.
- **It is not legal advice.**
- **It never files, submits, or sends anything** to any institution.
- **No authenticated systems, no non-public student data, no DePaul systems.** Public policy URLs
  only; all case data in this repository is synthetic.
- **It refuses more than it answers, on purpose.** `BLOCKED_SOURCE_CONFLICT`, `UNDETERMINED`, and
  "held for human review" are the intended outputs whenever the sources do not support a conclusion.

---

## Repository map

| Path | What it is |
| --- | --- |
| `engine/src/` | The deterministic engine. No LLM call anywhere in this package. |
| `engine/GROK_HANDOFF.md` | The external-agent contract: commands, input shapes, and what the engine refuses |
| `engine/bench/` | RecourseBench: cases, pinned sources, runner |
| `engine/examples/` | Live-runnable inputs and the traces they produce |
| `engine/test/` | 176 tests |
| `ARCHITECTURE.md`, `POLICY_IR.md`, `STATE_MACHINE.md` | System design, the rule IR, the case lifecycle |
| `SAFETY.md` | Fail-closed rules: source hierarchy, no invented rights, human-approval boundaries |
| `skills/`, `routines/` | Grok Bot Skill and Routine instructions |
| `SUBMISSION_PACK.md` | Demo storyboard, submission checklist, and a ledger of exactly which claims are tested |

## Verify it yourself

```bash
cd recourse-grokbot/engine
npm ci
npm run typecheck
npm test          # 176 tests
npm run bench     # 28 benchmark properties against five real policies
npm run build
```

`bench` and `test` run offline against pinned sources. `analyze`, `trace`, and `drift` fetch the live
URLs named in their inputs.
