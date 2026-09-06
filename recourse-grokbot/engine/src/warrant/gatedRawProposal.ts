import type { CandidatePolicyRule, ValidatedPolicyRule } from "../types/policy.ts";
import type { EvidenceWarrant, WarrantError } from "../types/warrant.ts";
import type { ValidationError } from "../validation/errors.ts";
import type { AuthorityResolution } from "../authority/authorityResolver.ts";
import { gateSourceId } from "../authority/authorityGate.ts";
import type { SourceStore } from "./sourceStore.ts";
import type { PipelineBatchResult, PipelineOutcome } from "./pipeline.ts";
import { proposeAndValidate } from "./pipeline.ts";
import { resolveRawProposal, type RawClaimProposal } from "./rawProposal.ts";

/**
 * Authority-gated policy-rule compilation.
 *
 * conformance/conformancePipeline.ts has always refused to compile a
 * procedural constraint from a source authority resolution did not select.
 * Policy rules had no equivalent gate: warrant/rawProposal.ts will happily
 * validate an accurately quoted obligation from a document that does not
 * govern the case at hand, because a span check cannot tell the difference
 * between an accurate quote from the right policy and an accurate quote from
 * the wrong one. That is the WRONG SOURCE failure mode, and this closes it
 * for the policy layer using the same shared gate (authority/authorityGate.ts)
 * the conformance layer uses.
 *
 * The gate runs BEFORE quote resolution: there is no reason to resolve spans
 * in a document that cannot govern this case, and refusing early keeps the
 * rejection reason about applicability rather than about text.
 */
export type GatedRuleOutcome = PipelineOutcome & { readonly warrant?: EvidenceWarrant };

export function proposeGatedRawRule(
  proposal: RawClaimProposal,
  store: SourceStore,
  authority: AuthorityResolution
): GatedRuleOutcome {
  const gate = gateSourceId(authority, proposal.sourceId);
  if (!gate.ok) {
    const error: WarrantError = { ruleId: proposal.rule.id, field: "sourceId", message: gate.reason };
    return { status: "rejected", errors: [error] };
  }

  const resolved = resolveRawProposal(proposal, store);
  if (resolved.status === "rejected") {
    return { status: "rejected", errors: resolved.errors };
  }
  if (resolved.status === "needs_review") {
    return { status: "needs_review", candidate: resolved.candidate, reason: resolved.reason };
  }

  const outcome = proposeAndValidate(resolved.candidate, store);
  // The verified warrant is carried back out alongside the rule because
  // ValidatedPolicyRule deliberately does not retain one -- provenance is
  // part of the rule, but the checkable span/hash pointer is evidence about
  // the rule, and the Recourse Trace needs it for the proof trail.
  return outcome.status === "validated" ? { ...outcome, warrant: resolved.candidate.warrant } : outcome;
}

export interface RuleWarrantRecord {
  readonly ruleId: string;
  readonly warrant: EvidenceWarrant;
}

export interface GatedRuleBatchResult extends PipelineBatchResult {
  /** Verified warrant for every rule that reached "validated", in the same order. */
  readonly warrants: ReadonlyArray<RuleWarrantRecord>;
}

/** Batch form of proposeGatedRawRule. Never throws; partitions into three buckets. */
export function proposeGatedRawRules(
  proposals: ReadonlyArray<RawClaimProposal>,
  store: SourceStore,
  authority: AuthorityResolution
): GatedRuleBatchResult {
  const validated: ValidatedPolicyRule[] = [];
  const needsReview: { candidate: CandidatePolicyRule; reason: string }[] = [];
  const errors: (WarrantError | ValidationError)[] = [];
  const warrants: RuleWarrantRecord[] = [];

  for (const proposal of proposals) {
    const outcome = proposeGatedRawRule(proposal, store, authority);
    if (outcome.status === "validated") {
      validated.push(outcome.rule);
      if (outcome.warrant) warrants.push({ ruleId: outcome.rule.id, warrant: outcome.warrant });
    } else if (outcome.status === "needs_review") {
      needsReview.push({ candidate: outcome.candidate, reason: outcome.reason });
    } else {
      errors.push(...outcome.errors);
    }
  }

  return { validated, needsReview, errors, warrants };
}
