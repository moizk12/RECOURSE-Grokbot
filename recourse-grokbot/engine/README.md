# Recourse Engine (Phase 1)

The deterministic case engine. No LLM calls anywhere in this package — every
function here is a pure function over already-validated data, and it is
designed so no consequential case conclusion can depend on unvalidated LLM
output.

Pipeline: `candidate policy rules → provenance validation → rule validation →
procedure model → case events → deterministic case state → procedural
deviation detection`.

## Requirements

Node.js >= 23.6 (for native TypeScript execution — no build step, no
transpiler dependency). `typescript` and `@types/node` are dev-only, used
solely for `npm run typecheck`.

## Run

```bash
npm install
npm run typecheck
npm test
node src/cli/index.ts evaluate fixtures/uic-case.json
```

## Layout

```
src/types/          policy + case data model (CandidatePolicyRule, ValidatedPolicyRule, CaseEvent, ...)
src/validation/      provenance + structural rule validation (fail-closed)
src/calendar/        deterministic business-day/date engine
src/procedure/       procedure model (obligations/evidence gates/escalation/terminal states) + conflict detection
src/case/            append-only event log + Case Twin state computation
src/deviation/       procedural deviation detection
src/cli/             `recourse evaluate <fixture.json>`
test/                node:test suite — see file names for the specific adversarial claim each proves
fixtures/            example case fixtures consumed by the CLI and the pipeline test
```

## What a candidate rule must supply to become executable

A `CandidatePolicyRule` (the only shape an LLM may emit) becomes a
`ValidatedPolicyRule` only via `validation/ruleValidator.ts#validateRule`,
which fails closed: missing provenance, an unrecognized deontic force, an
omitted trigger, an unevidenced `CLOSED` grounds list, or a malformed
deadline all reject the rule rather than filling in a "reasonable
assumption." There is no other constructor for a `ValidatedPolicyRule`, and
nothing downstream accepts a `CandidatePolicyRule`.
