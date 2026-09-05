import type { CandidatePolicyRule, ValidatedPolicyRule } from "../types/policy.ts";
import type { WarrantError } from "../types/warrant.ts";
import type { ValidationError } from "../validation/errors.ts";
import { validateRule } from "../validation/ruleValidator.ts";
import { checkWarrant } from "./warrantValidator.ts";
import type { SourceStore } from "./sourceStore.ts";

export type PipelineOutcome =
  | { readonly status: "validated"; readonly rule: ValidatedPolicyRule }
  | { readonly status: "needs_review"; readonly candidate: CandidatePolicyRule; readonly reason: string }
  | { readonly status: "rejected"; readonly errors: ReadonlyArray<WarrantError | ValidationError> };

/**
 * The full untrusted-candidate-to-executable-rule path:
 * warrant-check (stage 0) -> existing provenance + rule validation
 * (validation/ruleValidator.ts, unchanged). This is the one function a Grok
 * Bot skill should call per proposed candidate -- a ValidatedPolicyRule can
 * only come out of the "validated" branch, and nothing here can skip the
 * warrant check to reach validateRule directly.
 */
export function proposeAndValidate(candidate: CandidatePolicyRule, store: SourceStore): PipelineOutcome {
  const warrantOutcome = checkWarrant(candidate, store);

  if (warrantOutcome.status === "rejected") {
    return { status: "rejected", errors: warrantOutcome.errors };
  }
  if (warrantOutcome.status === "needs_review") {
    return { status: "needs_review", candidate: warrantOutcome.candidate, reason: warrantOutcome.reason };
  }

  const result = validateRule(warrantOutcome.candidate);
  if (!result.ok) {
    return { status: "rejected", errors: result.errors };
  }
  return { status: "validated", rule: result.value };
}

export interface PipelineBatchResult {
  readonly validated: ValidatedPolicyRule[];
  readonly needsReview: ReadonlyArray<{ readonly candidate: CandidatePolicyRule; readonly reason: string }>;
  readonly errors: ReadonlyArray<WarrantError | ValidationError>;
}

/** Batch form of proposeAndValidate. Never throws; partitions into three buckets. */
export function proposeAndValidateAll(candidates: CandidatePolicyRule[], store: SourceStore): PipelineBatchResult {
  const validated: ValidatedPolicyRule[] = [];
  const needsReview: { candidate: CandidatePolicyRule; reason: string }[] = [];
  const errors: (WarrantError | ValidationError)[] = [];

  for (const candidate of candidates) {
    const outcome = proposeAndValidate(candidate, store);
    if (outcome.status === "validated") {
      validated.push(outcome.rule);
    } else if (outcome.status === "needs_review") {
      needsReview.push({ candidate: outcome.candidate, reason: outcome.reason });
    } else {
      errors.push(...outcome.errors);
    }
  }

  return { validated, needsReview, errors };
}
