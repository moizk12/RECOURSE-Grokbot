# Recourse

**A student-owned procedural intelligence agent for adverse university decisions — not an appeal-writing chatbot.**

## The problem

When a student is dismissed, suspended, denied financial aid for lack of progress, or otherwise hit with an adverse academic decision, they face a due-process problem disguised as a writing problem:

- The governing procedure exists, but it's scattered across a registrar page, a bulletin section, a college-level handbook, and a PDF form, sometimes contradicting itself.
- Deadlines are short (5–30 days is typical), asymmetric (the student's clock is public; the institution's own response clock is usually buried in the same document and rarely enforced by anyone), and often computed in "business days" or "working days" with institution-specific holiday calendars.
- Eligibility is gated on *procedural or narrowly-defined grounds* (procedural error, non-academic bias, documented extenuating circumstances) — not on "this isn't fair" or "I disagree with the grade." Most students don't know their situation doesn't qualify until after they've spent their one shot.
- Evidence requirements are specific (a dated letter, a police report, a doctor's note) and easy to under-supply.
- A growing number of institutions now explicitly prohibit or discourage AI-authored appeal narrative — the exact place where "just have ChatGPT write my appeal" actively damages the student's case (see `COMPETITIVE_REVIEW.md`).

The existing tools address pieces of this: RAG chatbots answer "what does the handbook say," AI writing tools draft appeal prose (the one thing several institutions penalize), case-management software runs the *institution's* side of the process, and human advising services do this work manually, at hourly rates, per case.

Nothing surveyed treats the situation as what it structurally is: **a bilateral contract with a clock**, where both the student and the institution have obligations, deadlines, and failure states, and where the correct first move is very often "you have no valid ground — do not spend your one appeal" rather than "here is a draft."

## What Recourse is

Recourse is a persistent Grok Bot agent that, given a university name and a redacted description of an adverse decision:

1. **Finds and verifies the institution's actual, current, authoritative public policy** for that decision type — never a guess, never a cached assumption, never a policy for the wrong campus/college/decision-type.
2. **Compiles that policy into structured, executable case logic** (`POLICY_IR.md`, `schemas/policy.schema.json`) — triggers, eligible grounds, evidence requirements, both parties' deadlines, business-day rules, escalation path, terminal states, and any AI-authorship restriction the institution itself imposes.
3. **Opens a case file** (`schemas/case.schema.json`) against that policy, and evaluates the student's specific facts against it — including telling the student plainly when they have **no permitted ground**, when their **evidence is incomplete**, or when a **source conflict or staleness issue** means no confident answer can be given at all.
4. **Tracks obligations symmetrically.** The student's deadline is not more important than the institution's response deadline. Recourse watches both.
5. **Persistently monitors** the case via a Grok Bot Routine, re-verifying the source policy hasn't changed and flagging institutional timeouts or newly-available escalation paths.
6. **Never writes the student's personal appeal narrative** where policy prohibits or discourages AI authorship, and never invents a ground, a fact, a right, or a deadline that isn't in the sourced policy or the student's own stated facts.

The deliverable to the student at any point is a structured case status, not prose ghostwritten in their voice. Where policy permits and the student explicitly asks, Recourse can produce a fact sheet the student uses to write their *own* appeal — but that is opt-in, logged, and clearly separated from the case logic itself.

## What this repository is (current phase)

This is a **research, specification, and evaluation** deliverable for the Grok Bot Student Build Challenge. It intentionally does not include a polished frontend or a working bot deployment. It contains:

| File | Purpose |
|---|---|
| `ARCHITECTURE.md` | Grok Bot-native system design: one persistent Bot, public web research, filesystem-backed state, Skills, one Routine |
| `POLICY_IR.md` | The intermediate representation every scraped policy is compiled into |
| `schemas/policy.schema.json`, `schemas/case.schema.json` | Machine-checkable JSON Schema for the above |
| `STATE_MACHINE.md` | The case lifecycle, including refusal and stall states |
| `SAFETY.md` | Fail-closed rules: source hierarchy, no invented rights, human-approval boundaries, conflicting/stale/missing-source handling, AI-authorship restrictions |
| `skills/open-case.md`, `skills/check-case.md` | Draft Grok Bot Skill instructions |
| `routines/case-watch.md` | Draft recurring Routine behavior |
| `benchmarks/` | An adversarial evaluation corpus built from real, public, official university policies and entirely synthetic students |
| `COMPETITIVE_REVIEW.md` | An honest search for prior art that could kill this idea's novelty |
| `DEMO_OPTIONS.md` | Three ranked 60–90s demo concepts |

## Explicit non-goals and boundaries

- **Not an appeal-writing tool.** Recourse's default output is structured case status. Narrative generation is opt-in, gated by the institution's own AI-use policy, and never the primary deliverable.
- **No DePaul access, no authenticated systems, no non-public data, anywhere.** All research targets are public policy pages; all evaluation cases are synthetic students at real institutions whose policies are publicly published.
- **No fabrication.** If Recourse cannot verify a fact from an authoritative public source, it says so and stops — it does not interpolate. See `SAFETY.md`.
- **No submission authority.** Recourse never files, submits, or sends anything on the student's behalf. Every state transition into `READY_FOR_HUMAN` or beyond requires the student's explicit action outside the Bot.

## Research method and its limits (read before trusting any cited fact)

Every policy fact, deadline, and quote in this repository was gathered via web search against official university domains during this research pass; **direct full-page fetches of the cited URLs were blocked by this environment's network egress policy** (every `.edu`/`.ac.uk` domain attempted returned `EGRESS_BLOCKED`). This means facts here are reconstructed from search-engine snippets and summaries **citing** the authoritative URL, not from a verified raw HTML capture of that URL.

This is disclosed deliberately, not glossed over: it is precisely the "source verification failure" scenario Recourse itself must be built to detect and refuse to paper over (see `benchmarks/case-10-source-failure.md` and `SAFETY.md` §Missing/Unfetchable Source). A production Recourse Bot has real browser/fetch tooling and must re-verify every fact in this document against the live page — with a source hash and fetch timestamp — before it is allowed to act on it. Treat every specific number in this repo as **"reported by search snippet, needs live re-verification"**, not as a fetched-and-hashed fact.
