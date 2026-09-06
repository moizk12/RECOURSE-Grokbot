import type {
  CandidateConformanceRule,
  ConformanceRuleError,
  ValidatedConformanceRule,
} from "../types/conformance.ts";
import type { ClaimType } from "../types/warrant.ts";
import type { SourceStore } from "../warrant/sourceStore.ts";
import { resolveQuote } from "../warrant/resolveQuote.ts";
import type { AuthorityResolution } from "../authority/authorityResolver.ts";
import { gateSourceId } from "../authority/authorityGate.ts";
import { cerr } from "./conformanceValidator.ts";
import { proposeConformanceRule, type ConformancePipelineOutcome } from "./conformancePipeline.ts";

/**
 * The conformance-layer counterpart of warrant/rawProposal.ts#RawClaimProposal:
 * the only shape an untrusted model may emit when proposing a procedural
 * constraint ("the university must send hearing notice at least N days
 * before the hearing"). No `contentHash`, no `span` -- see
 * warrant/resolveQuote.ts.
 */
export interface RawConformanceProposal {
  readonly rule: Omit<CandidateConformanceRule, "warrant">;
  readonly quotedText: string;
  readonly claimType: ClaimType;
}

export type RawConformanceOutcome = ConformancePipelineOutcome;

/**
 * Authority gate first, then quote resolution, then the existing validator.
 *
 * The ordering is deliberate and is the whole point of this layer: a rule
 * citing a source that authority resolution did not select is refused
 * BEFORE its quote is even looked up, so a perfectly accurate quotation of
 * an inapplicable policy can never produce an executable constraint. That is
 * the same gate conformance/conformancePipeline.ts applies to pre-warranted
 * candidates -- applied here one stage earlier, because there is no reason
 * to resolve spans in a document that cannot govern this case.
 */
export function proposeRawConformanceRule(
  proposal: RawConformanceProposal,
  store: SourceStore,
  authority: AuthorityResolution
): RawConformanceOutcome {
  const rule = proposal.rule;

  const gate = gateSourceId(authority, rule.sourceId);
  if (!gate.ok) {
    return { status: "rejected", errors: [cerr(rule.id, "sourceId", gate.reason)] };
  }

  const resolution = resolveQuote(rule.sourceId, proposal.quotedText, proposal.claimType, store);

  if (resolution.status === "unresolvable") {
    return { status: "rejected", errors: [cerr(rule.id, `rawConformance.${resolution.field}`, resolution.reason)] };
  }
  if (resolution.status === "ambiguous") {
    return { status: "needs_review", candidate: { ...rule }, reason: resolution.reason };
  }

  return proposeConformanceRule({ ...rule, warrant: resolution.warrant }, store, authority);
}

export interface RawConformanceBatchResult {
  readonly validated: ValidatedConformanceRule[];
  readonly needsReview: ReadonlyArray<{ readonly candidate: CandidateConformanceRule; readonly reason: string }>;
  readonly errors: ReadonlyArray<ConformanceRuleError>;
}

/** Batch form of proposeRawConformanceRule. Never throws; partitions into three buckets. */
export function proposeRawConformanceRules(
  proposals: ReadonlyArray<RawConformanceProposal>,
  store: SourceStore,
  authority: AuthorityResolution
): RawConformanceBatchResult {
  const validated: ValidatedConformanceRule[] = [];
  const needsReview: { candidate: CandidateConformanceRule; reason: string }[] = [];
  const errors: ConformanceRuleError[] = [];

  for (const proposal of proposals) {
    const outcome = proposeRawConformanceRule(proposal, store, authority);
    if (outcome.status === "auto_promotable") {
      validated.push(outcome.rule);
    } else if (outcome.status === "needs_review") {
      needsReview.push({ candidate: outcome.candidate, reason: outcome.reason });
    } else {
      errors.push(...outcome.errors);
    }
  }

  return { validated, needsReview, errors };
}
