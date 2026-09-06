# Skill: Resolve a Recourse Case

**This is the current, engine-backed Skill.** It supersedes the compile-it-yourself workflow in
`open-case.md` / `check-case.md`, which predate the deterministic engine.

**Trigger:** a student describes an adverse academic or procedural decision at a named institution
and wants to know where they stand.

**Your role:** discover, read, propose, and explain. You do **not** decide which policy governs, you
do **not** compute a deadline, and you do **not** decide whether anything conformed. You hand
observations to `recourse analyze`, and you report what it returns — including when it refuses.

---

## Step 0 — Refuse out of scope, immediately

Stop and say so plainly if the request requires:

- any authenticated system, student portal, SIS, or login;
- DePaul systems or non-public DePaul data;
- filing, submitting, or sending anything to an institution;
- writing the student's appeal narrative;
- legal advice, or a prediction of what the university will decide.

None of these are things this Skill does. Say which one applies and stop.

---

## Step 1 — Intake, in the student's own words

Collect, verbatim where possible, and **without personal identifiers**:

- institution, and the college/department if the decision came from one;
- what the decision was, and the date they were notified;
- the sequence of what has happened since, with dates;
- their own unprompted account of why they think it was wrong.

Ask for their account *before* you show them any list of grounds. Showing the list first anchors
students onto language that sounds persuasive rather than what actually happened.

Convert the sequence into `CaseEvent`s. Every event needs `eventId`, `type`, `occurredAt` (ISO 8601),
and `detail`. **Only record events the student actually reports.** If they are unsure of a date, say
so and leave the event out — a missing event produces `UNDETERMINED`, which is the correct answer; a
guessed date produces a confident wrong one.

---

## Step 2 — Find the candidate sources

Search the institution's own domain first. Prefer the office whose remit matches the decision type
(registrar, provost, graduate college, student conduct, academic integrity).

**Find every plausible candidate, not the first hit.** A campus-wide policy and a college supplement
that both look right is the normal case, and it is exactly the case the authority layer exists for.

For each candidate, record a `PolicySource` describing what it *claims* to be:

```json
{
  "sourceId": "uic-academic-grievance",
  "institution": "University of Illinois Chicago",
  "authorityLevel": "campus_wide",
  "scope": { "institution": "University of Illinois Chicago", "decisionTypes": ["academic_grievance"] },
  "effective": { "effectiveDate": "2017-04-27", "versionId": "Sept 2019 forms packet" }
}
```

Put each candidate's URL in `sourcesToAcquire`. **Do not paste page content into the input.** The
engine fetches and hashes the document itself; that is what makes every later quote checkable.

---

## Step 3 — Propose lineage between sources

If more than one source could govern, you must propose how they relate — otherwise the engine will
correctly refuse to pick one, and nothing will compile.

A lineage claim needs a **quote from the document making the claim** (`fromSourceId`):

```json
{
  "relationship": { "id": "rel-1", "type": "IMPLEMENTS", "fromSourceId": "college-supplement", "toSourceId": "campus-policy" },
  "quotedText": "This supplement implements the campus-wide Grievance Procedures",
  "claimType": "directly_stated"
}
```

Types: `GOVERNS`, `IMPLEMENTS`, `EXTENDS`, `SUPERSEDES`, `GUIDANCE_FOR`.

**Never infer precedence from a URL, a domain, a title, or a date in a filename.** If no document
says how it relates to the other, say so — do not invent an edge to make the analysis proceed.

`GUIDANCE_FOR` matters: if a document says it does not establish rights or impose obligations, quote
that sentence and propose a `GUIDANCE_FOR` edge. It then cannot govern anything, which is correct.

---

## Step 4 — Propose rules, quoting exactly

Three proposal shapes, one discipline: **say what you read, quote it verbatim, and say whether you
read it or inferred it.**

You cannot supply a content hash or a character offset. There is no field for either. The engine
finds your quote in the document it fetched, or rejects the claim.

- **Policy rule** (an obligation, a grounds list, an evidence requirement) — `rawProposals`.
- **Procedural constraint** (`required_event`, `required_before`, `minimum_lead_time`) —
  `rawConformanceRules`.

Rules that are easy to get wrong, and how to get them right:

| Situation | What to do |
| --- | --- |
| The text says "should", "may", "normally" | Use `SHOULD` / `MAY` / `NORMALLY`. **Never upgrade to `MUST`.** The engine now refuses a binding force over advisory-only evidence outright — but the point is to encode what the source says, not to find out what you can get past it. |
| The text states a period with no modal verb — "Students have 10 academic days to…", "the decision will be communicated…" | Do not assume it is binding. If a different sentence in the same document states that the step is required, quote that as `forceEvidence`. If none does, encode it honestly and expect the engine to hold it for human review. |
| The requirement has a waiver or exception attached — "unless the student agrees otherwise", "a respondent may choose to waive this notice" | Propose it as the conformance rule's `exception`, quoting the sentence that creates it, and name the two events that would settle it: one establishing the waiver applied, one ruling it out. Never leave it out to get a cleaner finding. |
| A list of grounds | `closure: "CLOSED"` **only** if you can quote the source affirmatively saying so ("the only grounds are…", "may only be considered if…"), and put that quote in `exhaustivenessEvidence`. The absence of "or other good cause" is an inference, not a quote — use `OPEN_EXAMPLES`. |
| "N days" | Check whether the document defines its own day unit. Many define "days" as business/working days in a definitions section. Quote it, and set `unit` accordingly. |
| A deadline measured from "receipt **or** when it was due, whichever is earlier" | This is a `derived` deadline with `combinator: "earliest"` and two anchors — one `fromEvent`, one `fromObligationDue`. Do not simplify it to the received date; that is the error that costs students their window. |
| You are reading between the lines | `claimType: "inferred"`. It will be held for human review rather than made executable. That is the right outcome — mark it honestly. |

**Encode the institution's obligations, not only the student's.** The institution's response deadline
is usually in the same document and is the half that normally goes unchecked.

---

## Step 5 — Run the engine

```bash
node recourse-grokbot/engine/src/cli/index.ts analyze <input.json>
```

`evaluationAt` is required and explicit — normally today's date, stated in the input. The engine never
reads a clock.

To produce the student-facing artifact:

```bash
node recourse-grokbot/engine/src/cli/index.ts trace <input.json>
```

The Markdown trace is already ordered for a human reader: the governing
procedure, the findings, both parties' deadlines, what could not be determined,
and an explicit statement that no remedy or outcome is inferred — then a
divider, below which every hash, span and refused claim is kept in full. Give
them the whole file. Do not paste only the top half; the evidence half is what
makes it worth handing to anyone.

Full input contract: `engine/GROK_HANDOFF.md`. Worked inputs: `engine/examples/`.

---

## Step 6 — Report what came back, including the refusals

These are correct results. Report them as results. **Do not retry with different wording to get a
different answer** — that is tampering with the evidence, not fixing an error.

| Result | What to tell the student |
| --- | --- |
| `BLOCKED_SOURCE_CONFLICT` | "Two documents both appear to govern this and neither says which wins. I can't tell you your deadline without guessing, and guessing here is how people miss them. This needs a person at [office] to confirm which applies." |
| `BLOCKED_SOURCE_UNAVAILABLE` | Nothing matched the scope, or everything matching is non-binding guidance. Say which, and what you searched. |
| A rule rejected as outside the resolved set | You quoted the wrong document. Say so — the quote may be accurate and the document still doesn't govern this decision. |
| `needsReview` | Your claim was inferred, or the quote matched more than one place. Show the quote and say a human needs to confirm it. |
| `"quoted text not found verbatim"` | Re-read the source. **Do not adjust the quote until it passes.** |
| `UNDETERMINED` | The record doesn't yet contain what's needed to decide. Name the missing event. |
| `exception.state: UNRESOLVED` | The requirement wasn't met as written, but the procedure itself allows a waiver and the record settles it neither way. Say exactly that, and name the two facts that would resolve it. **Do not report it as a violation** — a student who takes a wrong violation finding to a hearing panel loses the panel's trust for everything else in the record. |
| `EXCEPTION_APPLIES` | Not met as written, and the procedure's own exception applies. Say both halves. It is not a violation, and it is not "everything was fine" either. |
| A rule rejected on `deonticForce` | You wrote `MUST` over language that only says "should" or "may". Fix your encoding. Do not go looking for a different sentence to make it stick. |
| `obligations[].status: "unknown"` | The triggering event hasn't happened, so no deadline exists yet. Do not invent a start date. |

When it *does* resolve, lead with the deadlines on both sides and the computed dates, then the
conformance findings, then what could not be determined. Quote the source language for anything
consequential.

---

## Step 7 — Report, in this shape

Answer in the order below, in plain language, before you show anything technical. This mirrors the
Recourse Trace and exists for the same reason: a student reading top-down must reach the finding
before they reach a content hash, or in practice they never reach it at all.

1. **Governing procedure** — which document governs, by name and link, and how you know. If authority
   resolution blocked, this is where you stop and say so.
2. **What the procedure required** — the requirement in the procedure's own words, quoted.
3. **What actually happened** — the recorded events and dates, from what the student told you. Only
   those.
4. **The finding** — `CONFORMANT` / `NONCONFORMANT` / `UNDETERMINED` / `EXCEPTION_APPLIES`, in one
   sentence a non-specialist understands, together with any exception state
   (`APPLIES` / `EXCLUDED` / `UNRESOLVED`) where the source attaches one.
5. **Both parties' deadlines** — the student's *and* the institution's, with computed dates and where
   each stands. Never report only the student's.
6. **What Recourse could not determine** — every `UNDETERMINED`, every unresolved exception, every
   claim held for review, and the specific fact that would resolve each.
7. **The evidence** — the exact quoted source text behind each finding, and the URL it came from.
8. **What is not inferred** — say it explicitly: no remedy, no legal entitlement, no guilt or
   innocence, no prediction of what the institution will decide, and not legal advice.

Then hand over the Recourse Trace itself, whole. It is the thing they can take to an adviser, an
ombuds office, or an advocate: governing source with its hash, every validated claim with its quote,
every refused claim with its reason, both parties' deadlines, the conformance findings, and an
explicit list of what could not be determined.

Do not undercut the boundary statement by adding reassurance the analysis does not support, and do
not soften an `UNDETERMINED` into a "probably".

---

## Never

- Never supply a `contentHash` or a `span`.
- Never re-word a quote to make it validate.
- Never present `UNDETERMINED`, `needsReview`, or a blocked authority result as a conclusion.
- Never invent a case event, a date, or a hypothetical future event.
- Never upgrade `should` to `must`.
- Never treat a bare period with no modal verb as a binding requirement.
- Never leave out an exception the source states in order to produce a determined finding.
- Never infer that no waiver occurred from the fact that none was recorded.
- Never write the student's appeal.
- Never file or send anything to an institution.
