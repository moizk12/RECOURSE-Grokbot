# Grok Handoff

For an external agent (Grok) driving this engine as a subprocess. No temporary
TypeScript integration script is needed — one CLI command exposes the full
boundary.

## Bootstrap (fresh machine / fresh clone)

```bash
cd recourse-grokbot/engine
npm ci
npm run build
node dist/cli/index.js resolve <input.json>
```

`npm ci` requires `package-lock.json` (committed) and network access to the
npm registry. `npm run build` requires no network. `resolve` requires network
access only for whatever URLs appear in the input's `sourcesToAcquire`.

Equivalent one-liner without a build step (Node.js >= 23.6, native TS
execution):

```bash
node recourse-grokbot/engine/src/cli/index.ts resolve <input.json>
```

## CLI contract: `recourse resolve <input.json>`

The command performs, in order: live source acquisition → raw proposal
resolution → warrant validation → rule validation → procedure model → Case
Twin → deviation detection. Every stage is pre-existing engine code
(`src/warrant/acquireSource.ts`, `src/warrant/rawProposal.ts`,
`src/warrant/pipeline.ts`, `src/procedure/procedureModel.ts`,
`src/case/caseTwin.ts`, `src/deviation/detector.ts`); this command only wires
them together. No engine semantics changed to add it.

### Input (`<input.json>`)

```ts
{
  evaluationAt: string;              // required, ISO 8601 — explicit case-evaluation instant, never wall-clock
  holidays?: string[];               // ISO date strings, for business-day math
  sourceAmbiguities?: string[];      // free-text notes surfaced as POLICY_SOURCE_AMBIGUITY deviations
  sourcesToAcquire?: {               // fetched live, in order, before anything else runs
    sourceId: string;
    requestedUrl: string;
  }[];
  sources?: SourceArtifact[];        // optional pre-captured sources (skip live fetch for these ids)
  rawProposals: RawClaimProposal[];  // required — the only shape an untrusted model may emit
  events: CaseEvent[];               // required — the case's append-only event log
}
```

`RawClaimProposal` (`src/warrant/rawProposal.ts`):

```ts
{
  rule: Omit<CandidatePolicyRule, "warrant">;  // CandidatePolicyRule: src/types/policy.ts
  sourceId: string;     // must match a sourcesToAcquire[].sourceId or sources[].sourceId
  quotedText: string;   // exact verbatim text the rule is being derived from
  claimType: "directly_stated" | "inferred";
}
```

`CaseEvent` (`src/types/case.ts`):

```ts
{ eventId: string; type: CaseEventType; occurredAt: string; detail: Record<string, unknown> }
```

See `fixtures/uic-case-raw.json` for a complete, live-network-runnable
example (real UIC policy URL, two obligations, two case events).

### Output (stdout, JSON)

```ts
{
  validatedRuleCount: number;
  rejectedRuleCount: number;
  rejectedRuleErrors: (WarrantError | ValidationError)[];  // rule-level failures, ruleId/field/message
  needsReviewCount: number;
  needsReview: { candidate: CandidatePolicyRule; reason: string }[];
  caseState: {
    evaluationAt: string;
    obligations: { obligationId, party, dueAt, status, reason }[];  // calculated deadlines
    eligibility: { result, reason, citedRuleId? };
  };
  deviations: { type, detail, relatedObligationId?, relatedRuleIds? }[];
  conflicts: RuleConflict[];
  sources: {                          // provenance metadata for every source actually used
    sourceId, requestedUrl, finalUrl, retrievedAt,
    contentType, rawBytesHash, contentHash, extractor
  }[];
}
```

Exit code 0 with the JSON above on success; exit code 1 with a one-line error
message on stderr otherwise (bad usage, unreachable source, malformed input
JSON).
