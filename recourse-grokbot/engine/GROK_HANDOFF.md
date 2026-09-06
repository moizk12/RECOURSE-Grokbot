# Grok Handoff

For an external agent (Grok) driving this engine as a subprocess. No temporary
TypeScript integration script is needed — one CLI command exposes the full
boundary.

Grok's job is to **discover, read, propose, and explain**. The engine's job is
to **capture, verify, resolve, calculate, and refuse**. The division is not a
style preference: every field this document lets a model supply is one a model
can legitimately observe, and every field it cannot supply is one that would let
an unverified claim become an executable conclusion.

## Bootstrap (fresh machine / fresh clone)

```bash
cd recourse-grokbot/engine
npm ci
npm run build
node dist/cli/index.js analyze <input.json>
```

`npm ci` requires `package-lock.json` (committed) and network access to the npm
registry. `npm run build` requires no network. `analyze` requires network access
only for the URLs in the input's `sourcesToAcquire`.

Equivalent one-liner without a build step (Node.js >= 23.6, native TS execution):

```bash
node recourse-grokbot/engine/src/cli/index.ts analyze <input.json>
```

## Commands

| Command | What it does |
| --- | --- |
| `recourse analyze <input.json>` | **The current full chain.** Acquisition → lineage → authority → gated rules → Procedure Model → Case Twin → gated conformance → conformance check → deviations → forecast. JSON on stdout. |
| `recourse trace <input.json>` | The same analysis, rendered as a Recourse Trace. Markdown by default; `--json` for the machine-readable artifact. |
| `recourse drift <trace.json>` | Re-acquires a stored trace's pinned sources and reports what needs revalidation. `--json` for the report object. |
| `recourse resolve <input.json>` | The v0.1 contract: acquisition → raw proposals → Case Twin → deviations, **with no authority layer**. Unchanged and still supported; prefer `analyze` for new work. |
| `recourse evaluate <fixture.json>` | v0.1, pre-captured sources, no network. |

All commands exit 0 on success and 1 with a one-line message on stderr
otherwise (bad usage, unreachable source, malformed input JSON).

## `recourse analyze <input.json>`

### Input

```ts
{
  caseId: string;
  evaluationAt: string;              // required ISO 8601 — the explicit instant the case is evaluated as of.
                                     // Nothing in this path reads wall-clock time. Two runs with different
                                     // evaluationAt values are EXPECTED to differ.
  dataMarker?: string;               // recorded verbatim, e.g. "synthetic". Never inferred.
  holidays?: string[];               // ISO dates, for business-day math
  sourceAmbiguities?: string[];      // free-text notes surfaced as POLICY_SOURCE_AMBIGUITY deviations

  sourcesToAcquire?: { sourceId: string; requestedUrl: string }[];   // fetched live, first
  sources?: SourceArtifact[];                                        // or supply pre-captured artifacts

  policySources?: PolicySource[];    // what each source CLAIMS to be: institution, authorityLevel,
                                     // scope { institution, unit?, decisionTypes[], studentTypes?, excludes? },
                                     // effective { effectiveDate, versionId? }
  authorityQuery: {                  // required — the decision this case needs a governing source for
    institution: string;
    decisionType: string;
    unit?: string;
    studentType?: string;
    asOf?: string;                   // defaults to evaluationAt; never to wall-clock time
  };

  rawRelationships?: RawRelationshipProposal[];   // lineage between sources
  rawProposals?: RawClaimProposal[];              // policy rules
  rawConformanceRules?: RawConformanceProposal[]; // procedural constraints
  events: CaseEvent[];                            // the case's append-only trace
  forecast?: ForecastScenario[];
}
```

### The three proposal shapes

All three are the same idea: **say what you read, quote it, and say whether you
read it or inferred it.** None of them has a `contentHash` field or a character
`span` field, because the engine derives both, from a unique verbatim match
against the captured source (`src/warrant/resolveQuote.ts`). A quote that
appears zero times is rejected; a quote that appears more than once is routed to
human review rather than guessed at.

```ts
// Policy rule — src/warrant/rawProposal.ts
{ rule: Omit<CandidatePolicyRule, "warrant">, sourceId, quotedText, claimType }

// Source lineage — src/authority/rawRelationship.ts
// type: GOVERNS | IMPLEMENTS | EXTENDS | SUPERSEDES | GUIDANCE_FOR
// The quote is always checked against fromSourceId — the document making the claim.
{ relationship: { id, type, fromSourceId, toSourceId }, quotedText, claimType }

// Procedural constraint — src/conformance/rawConformance.ts
// constraint: required_event | required_before | minimum_lead_time
{ rule: { id, sourceId, actor, constraint }, quotedText, claimType }
```

`claimType` is `"directly_stated"` or `"inferred"`. **Inferred claims are never
auto-promoted**, in any of the three layers, even when the quoted span verifies
exactly. Mark a claim inferred when it is your reading of the text rather than
what the text says; doing so routes it to review instead of silently making it
executable.

### Forecast scenarios

```ts
{
  id: string;
  kind: "NO_NEW_EVENTS" | "EXPLICIT_SCENARIO";
  evaluationAt: string;                  // explicit; a missing one is refused, not defaulted
  hypotheticalEvents?: CaseEvent[];      // EXPLICIT_SCENARIO only; refused on NO_NEW_EVENTS
  assumptions?: string[];                // recorded verbatim in the result and the trace
}
```

Forecasting answers "what does the validated procedure imply at this instant,
under this stated scenario" — not "what will the university do". Every
hypothetical event must come from the caller or the student; the engine has no
code path that constructs one. The real event log is never mutated.

### Output

```ts
{
  caseId, evaluationAt, dataMarker?,
  sources: { sourceId, requestedUrl, finalUrl, retrievedAt, contentType,
             rawBytesHash, contentHash, extractor }[],
  authorityQuery, policySources,
  authority: { status: "APPLICABLE" | "BLOCKED_SOURCE_CONFLICT" | "BLOCKED_SOURCE_UNAVAILABLE", ... },
  relationships:    { validated[], needsReview[], rejected[] },
  rules:            { validated[], needsReview[], rejected[] },
  conformanceRules: { validated[], needsReview[], rejected[] },
  ruleWarrants: { ruleId, warrant }[],
  advisoryRules[], eligibilityGrounds[], conflicts[],
  caseState: { evaluationAt, obligations: { obligationId, party, dueAt, status, reason }[], eligibility },
  conformance: { ruleId, status: "CONFORMANT" | "NONCONFORMANT" | "UNDETERMINED", reason }[],
  deviations[], forecast[], observedEvents[]
}
```

## What to expect when the engine refuses

These are correct outcomes, not errors. Report them to the student as they are;
do not retry with different wording to get a different answer.

| You see | It means |
| --- | --- |
| `authority.status: BLOCKED_SOURCE_CONFLICT` | Two or more sources claim this scope with no validated relationship between them. **No rule of any kind compiles.** A human must designate which governs. |
| `authority.status: BLOCKED_SOURCE_UNAVAILABLE` | Nothing matched the scope, or everything matching it is validated non-binding guidance. |
| A rule in `rules.rejected` citing "not part of the authority-resolved governing/supporting set" | You quoted the wrong document. The quote may be perfectly accurate; the document still does not govern this decision. |
| A claim in `needsReview` | Either your `claimType` was `inferred`, or your quote matched more than one place in the source. Ask a human, or quote a longer unique span. |
| `"quoted text not found verbatim"` | The text is not in the captured document. Re-read the source; do not adjust the quote until it passes. |
| `conformance[].status: UNDETERMINED` | The trace does not yet contain the events needed to decide. This is the right answer, not a gap to fill in. |
| `obligations[].status: "unknown"` | The triggering event has not occurred, so no deadline exists yet. Do not invent a start date. |

## What Grok must never do

- Never supply a `contentHash` or a `span`. There is no field for either.
- Never re-word a quote to make it validate.
- Never present a `needsReview` or `UNDETERMINED` result as a conclusion.
- Never invent a hypothetical event to make a forecast more useful.
- Never file, submit, or send anything to an institution.
- Never touch authenticated systems or non-public student data.

## Worked examples

`examples/uic-grievance.json` and `examples/cwru-formal-hearing.json` are
complete, live-runnable inputs against real public policy URLs with synthetic
student data. `examples/traces/` holds the artifacts they produce.
