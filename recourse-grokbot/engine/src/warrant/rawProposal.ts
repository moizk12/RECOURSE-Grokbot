import type { CandidatePolicyRule, ValidatedPolicyRule } from "../types/policy.ts";
import type { ClaimType, WarrantError } from "../types/warrant.ts";
import type { ValidationError } from "../validation/errors.ts";
import { proposeAndValidate } from "./pipeline.ts";
import type { PipelineBatchResult, PipelineOutcome } from "./pipeline.ts";
import type { SourceStore } from "./sourceStore.ts";
import { resolveQuote } from "./resolveQuote.ts";

function werr(ruleId: string, field: string, message: string): WarrantError {
  return { ruleId, field, message };
}

/**
 * The only shape an untrusted model (Grok) may emit for an evidence-backed
 * claim. It supplies the rule claim itself, which source it is citing, the
 * exact text it believes supports the claim, and whether the claim is
 * directly stated or inferred -- nothing else. There is deliberately no
 * `contentHash` and no character `span` field here: warrant/resolveQuote.ts
 * is the only code allowed to produce those, deterministically, from a
 * unique match against an already-captured SourceArtifact. The model cannot
 * supply its own hash or offset because this type has no field for either.
 */
export interface RawClaimProposal {
  readonly rule: Omit<CandidatePolicyRule, "warrant">;
  readonly sourceId: string;
  readonly quotedText: string;
  readonly claimType: ClaimType;
}

export type RawProposalOutcome =
  | { readonly status: "resolved"; readonly candidate: CandidatePolicyRule }
  | { readonly status: "needs_review"; readonly candidate: CandidatePolicyRule; readonly reason: string }
  | { readonly status: "rejected"; readonly errors: WarrantError[] };

/**
 * Binds a RawClaimProposal to a captured SourceArtifact via the shared quote
 * resolver (warrant/resolveQuote.ts): zero verbatim occurrences is rejected
 * outright, more than one is routed to needs_review rather than guessed at,
 * and exactly one resolves into a full EvidenceWarrant whose contentHash
 * comes from the captured source itself and whose span comes from the
 * match's own offsets. Fail-closed throughout, same discipline as
 * warrantValidator.ts: every branch that cannot uniquely verify the quote
 * returns rejected/needs_review, never a guessed warrant.
 */
export function resolveRawProposal(proposal: RawClaimProposal, store: SourceStore): RawProposalOutcome {
  const ruleId = proposal.rule.id;
  const resolution = resolveQuote(proposal.sourceId, proposal.quotedText, proposal.claimType, store);

  if (resolution.status === "unresolvable") {
    return { status: "rejected", errors: [werr(ruleId, `rawProposal.${resolution.field}`, resolution.reason)] };
  }
  if (resolution.status === "ambiguous") {
    return { status: "needs_review", candidate: { ...proposal.rule }, reason: resolution.reason };
  }

  return { status: "resolved", candidate: { ...proposal.rule, warrant: resolution.warrant } };
}

/**
 * The one function a Grok Bot skill should call per raw proposal. Resolves
 * the proposal against `store` (see resolveRawProposal) and, only if
 * resolution produced a unique, verified warrant, hands the resulting
 * candidate to the existing, unchanged warrant-check + rule-validation
 * pipeline (warrant/pipeline.ts#proposeAndValidate). An ambiguous or
 * unverifiable quote never reaches that pipeline.
 */
export function proposeRawAndValidate(proposal: RawClaimProposal, store: SourceStore): PipelineOutcome {
  const resolved = resolveRawProposal(proposal, store);
  if (resolved.status === "rejected") {
    return { status: "rejected", errors: resolved.errors };
  }
  if (resolved.status === "needs_review") {
    return { status: "needs_review", candidate: resolved.candidate, reason: resolved.reason };
  }
  return proposeAndValidate(resolved.candidate, store);
}

/** Batch form of proposeRawAndValidate. Never throws; partitions into three buckets. */
export function proposeRawAndValidateAll(proposals: RawClaimProposal[], store: SourceStore): PipelineBatchResult {
  const validated: ValidatedPolicyRule[] = [];
  const needsReview: { candidate: CandidatePolicyRule; reason: string }[] = [];
  const errors: (WarrantError | ValidationError)[] = [];

  for (const proposal of proposals) {
    const outcome = proposeRawAndValidate(proposal, store);
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
