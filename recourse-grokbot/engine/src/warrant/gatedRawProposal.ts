import type { CandidatePolicyRule, ValidatedPolicyRule } from "../types/policy.ts";
import type { WarrantError } from "../types/warrant.ts";
import type { ValidationError } from "../validation/errors.ts";
import type { AuthorityResolution } from "../authority/authorityResolver.ts";
import { gateSourceId } from "../authority/authorityGate.ts";
import type { SourceStore } from "./sourceStore.ts";
import type { PipelineBatchResult, PipelineOutcome } from "./pipeline.ts";
import { proposeRawAndValidate, type RawClaimProposal } from "./rawProposal.ts";

/**
 * Authority-gated policy-rule compilation.
 *
 * conformance/conformancePipeline.ts has always refused to compile a
 * procedural constraint from a source authority resolution did not select.
 * Policy rules had no equivalent gate: warrant/rawProposal.ts will happily
 * validate an accurately quoted obligation from a document that does not
 * govern the case at hand, because a span check cannot tell the difference.
 * That is the "WRONG SOURCE" failure mode, and this function closes it for
 * the policy layer using the same shared gate (authority/authorityGate.ts).
 *
 * The gate runs BEFORE quote resolution: there is no reason to resolve spans
 * in a document that cannot govern this case, and refusing early keeps the
 * rejection reason about applicability rather than about text.
 */
export function proposeGatedRawRule(
  proposal: RawClaimProposal,
  store: SourceStore,
  authority: AuthorityResolution
): PipelineOutcome {
  const gate = gateSourceId(authority, proposal.sourceId);
  if (!gate.ok) {
    const error: WarrantError = { ruleId: proposal.rule.id, field: "sourceId", message: gate.reason };
    return { status: "rejected", errors: [error] };
  }
  return proposeRawAndValidate(proposal, store);
}

/** Batch form of proposeGatedRawRule. Never throws; partitions into three buckets. */
export function proposeGatedRawRules(
  proposals: ReadonlyArray<RawClaimProposal>,
  store: SourceStore,
  authority: AuthorityResolution
): PipelineBatchResult {
  const validated: ValidatedPolicyRule[] = [];
  const needsReview: { candidate: CandidatePolicyRule; reason: string }[] = [];
  const errors: (WarrantError | ValidationError)[] = [];

  for (const proposal of proposals) {
    const outcome = proposeGatedRawRule(proposal, store, authority);
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
