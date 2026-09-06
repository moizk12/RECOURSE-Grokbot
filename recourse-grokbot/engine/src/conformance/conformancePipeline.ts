import type { CandidateConformanceRule, ConformanceRuleError, ValidatedConformanceRule } from "../types/conformance.ts";
import type { SourceStore } from "../warrant/sourceStore.ts";
import type { AuthorityResolution } from "../authority/authorityResolver.ts";
import { cerr, validateConformanceRule, type ConformanceWarrantOutcome } from "./conformanceValidator.ts";

export type ConformancePipelineOutcome = ConformanceWarrantOutcome;

/**
 * The only entry point that may turn a CandidateConformanceRule into a
 * ValidatedConformanceRule. Authority resolution gates everything else: a
 * rule is never even warrant-checked unless `authority.status ===
 * "APPLICABLE"` and the rule's declared `sourceId` is either the resolved
 * governing source or one of its validated supporting (implementing/
 * extending) sources. A source still in BLOCKED_SOURCE_CONFLICT or
 * BLOCKED_SOURCE_UNAVAILABLE -- or a rule citing some third source outside
 * the resolved set entirely -- is rejected here, before
 * conformanceValidator.ts ever runs, no matter how well warranted the
 * rule's own text is. This is what stops Recourse from confidently
 * evaluating procedural conformance against the wrong governing source.
 */
export function proposeConformanceRule(
  candidate: CandidateConformanceRule,
  store: SourceStore,
  authority: AuthorityResolution
): ConformancePipelineOutcome {
  if (authority.status !== "APPLICABLE") {
    return {
      status: "rejected",
      errors: [
        cerr(
          candidate.id,
          "sourceId",
          `authority for this scope is not resolved (status: ${authority.status}) -- no conformance rule may be compiled until a human resolves the governing source`
        ),
      ],
    };
  }

  const allowedSourceIds = new Set([authority.governingSourceId, ...authority.supportingSourceIds]);

  if (!candidate.sourceId || !allowedSourceIds.has(candidate.sourceId)) {
    return {
      status: "rejected",
      errors: [
        cerr(
          candidate.id,
          "sourceId",
          `source '${candidate.sourceId}' is not part of the authority-resolved governing/supporting set {${[...allowedSourceIds].join(", ")}} for this scope`
        ),
      ],
    };
  }

  return validateConformanceRule(candidate, store);
}

export interface ConformancePipelineBatchResult {
  readonly validated: ValidatedConformanceRule[];
  readonly needsReview: ReadonlyArray<{ readonly candidate: CandidateConformanceRule; readonly reason: string }>;
  readonly errors: ReadonlyArray<ConformanceRuleError>;
}

/** Batch form of proposeConformanceRule. Never throws; partitions into three buckets. */
export function proposeConformanceRules(
  candidates: CandidateConformanceRule[],
  store: SourceStore,
  authority: AuthorityResolution
): ConformancePipelineBatchResult {
  const validated: ValidatedConformanceRule[] = [];
  const needsReview: { candidate: CandidateConformanceRule; reason: string }[] = [];
  const errors: ConformanceRuleError[] = [];

  for (const candidate of candidates) {
    const outcome = proposeConformanceRule(candidate, store, authority);
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
