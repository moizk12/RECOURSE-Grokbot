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

## CLI commands

- `recourse evaluate <fixture.json>` — pre-warranted `candidateRules` + pre-captured `sources`, no network call. See `src/cli/evaluate.ts`.
- `recourse resolve <input.json>` — the full untrusted-input boundary: live source acquisition (`sourcesToAcquire`) -> raw proposal resolution (`rawProposals`, the `RawClaimProposal` contract) -> warrant validation -> rule validation -> procedure model -> Case Twin -> deviations. This is the one stable entry point for an external caller (e.g. a Grok Bot skill) that has not yet fetched or warranted anything. See `src/cli/resolveCase.ts` and `GROK_HANDOFF.md` for the input/output contract; `fixtures/uic-case-raw.json` is a live-network runnable example.

## Layout

```
src/types/          policy + case data model (CandidatePolicyRule, ValidatedPolicyRule, CaseEvent, ...)
src/validation/      provenance + structural rule validation (fail-closed)
src/authority/       policy source authority/lineage: relationship warrant check + deterministic governing-source resolver
src/conformance/     procedural conformance: required_event/required_before/minimum_lead_time rules, authority-gated pipeline, event-trace checker
src/calendar/        deterministic business-day/date engine
src/procedure/       procedure model (obligations/evidence gates/escalation/terminal states) + conflict detection
src/case/            append-only event log + Case Twin state computation
src/deviation/       procedural deviation detection
src/cli/             `recourse evaluate <fixture.json>`, `recourse resolve <input.json>`
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

## Which source governs

Rule validation only ever checks a *rule's* provenance. It says nothing
about whether the document that rule was compiled from is the right one to
be governing a given decision at all — the most damaging error Recourse can
make is confidently applying the wrong governing source (see
`benchmarks/case-07-conflicting-sources.md`, `case-08-stale-policy.md`).
`src/authority/` is the deterministic layer that answers that separately:

- `authority/relationshipValidator.ts#checkRelationshipWarrant` — the same
  warrant discipline as `warrant/warrantValidator.ts`, applied to a proposed
  relationship between two sources (`GOVERNS`/`IMPLEMENTS`/`EXTENDS`/
  `SUPERSEDES`/`GUIDANCE_FOR`, see `types/authority.ts`) instead of a rule.
  A relationship is never inferred from a source's URL, domain, or title —
  only from a verified quoted span that actually asserts it.
- `authority/authorityResolver.ts#resolveAuthority` — given a set of
  `PolicySource`s and only the `ValidatedSourceRelationship`s that passed
  the check above, deterministically returns `APPLICABLE` (with the one
  governing source id), `BLOCKED_SOURCE_UNAVAILABLE` (nothing matches the
  query scope), or `BLOCKED_SOURCE_CONFLICT` (two or more sources claim the
  scope with no validated relationship deciding between them) — mirroring
  the case-state vocabulary in `STATE_MACHINE.md` on purpose. It never picks
  a source by "more specific" or "more official-looking" defaults; an
  unresolved competing claim always fails closed into `BLOCKED_SOURCE_CONFLICT`.

## Did the case actually follow the procedure

Resolving which source governs still says nothing about whether the
institution's (or student's) actual conduct, as recorded in the case's
append-only event trace, followed that source's procedural requirements.
`src/conformance/` is the third trust boundary, layered directly on top of
authority resolution:

- `types/conformance.ts` — three constraint kinds: `required_event` (some
  event must appear in the trace at all, optionally with a boundary event
  that is the only thing allowed to turn its absence into a violation),
  `required_before` (one event must occur strictly before another), and
  `minimum_lead_time` (the gap between two events must be at least N
  business/calendar days). Every rule carries a responsible `actor` and a
  `warrant`.
- `conformance/conformanceValidator.ts` — the same warrant discipline as
  `warrant/warrantValidator.ts` and `authority/relationshipValidator.ts`:
  auto-promotable only for a verified, directly-stated claim; an inferred
  claim fails into review.
- `conformance/conformancePipeline.ts#proposeConformanceRule` — the
  authority gate. It refuses to even warrant-check a candidate unless the
  `AuthorityResolution` passed in is `APPLICABLE` and the candidate's
  `sourceId` is the resolved governing source or one of its validated
  supporting sources. A source still `BLOCKED_SOURCE_CONFLICT` or
  `BLOCKED_SOURCE_UNAVAILABLE` can never produce an executable conformance
  rule, however well warranted its own text is.
- `conformance/conformanceChecker.ts#checkConformance` — compares one
  `ValidatedConformanceRule` against a `CaseEventLog` and returns
  `CONFORMANT`, `NONCONFORMANT`, or `UNDETERMINED`. Fails closed toward
  `UNDETERMINED`: absence of an event is only ever reported as
  `NONCONFORMANT` once an actually-observed boundary or target event makes
  that conclusion unavoidable, never merely because time has passed with
  nothing logged.

`test/conformance.test.ts` runs this against a benchmark modeled on Case
Western Reserve University's Formal Hearing Process (five-business-day
hearing notice; relevant information made available before the hearing).
