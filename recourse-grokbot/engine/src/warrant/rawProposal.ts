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
  readonly rule: Omit<CandidatePolicyRule, "warrant" | "forceWarrant">;
  readonly sourceId: string;
  readonly quotedText: string;
  readonly claimType: ClaimType;
  /**
   * Optional SECOND quote from the same source, offered only to establish
   * that the rule's `deonticForce` is binding. Institutions routinely split a
   * requirement across sentences -- one states the period or the anchor, a
   * different one states that the step is required at all -- and a proposer
   * quoting the first honestly should not be forced to quote the wrong
   * sentence to get an accurate rule through
   * (validation/deonticSupport.ts is what reads this).
   *
   * It resolves through the same warrant/resolveQuote.ts as everything else:
   * no hash, no offset, unique verbatim match or nothing. Supplying it can
   * only ever add evidence. It cannot rescue a rule whose primary span is
   * advisory, and a rule whose primary span already carries binding language
   * has no need of it.
   */
  readonly forceEvidence?: { readonly quotedText: string; readonly claimType: ClaimType };
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

  const candidate: CandidatePolicyRule = { ...proposal.rule, warrant: resolution.warrant };

  // Force evidence, when offered, is held to exactly the same standard as the
  // primary quote: same source, unique verbatim match, no proposer-supplied
  // hash or offset. An unresolvable one is a rejection rather than a silent
  // fallback to "no force evidence supplied" -- it was put forward as
  // evidence and it did not check out.
  const fe = proposal.forceEvidence;
  if (!fe) return { status: "resolved", candidate };

  const forceResolution = resolveQuote(proposal.sourceId, fe.quotedText, fe.claimType, store);
  if (forceResolution.status === "unresolvable") {
    return {
      status: "rejected",
      errors: [werr(ruleId, `rawProposal.forceEvidence.${forceResolution.field}`, forceResolution.reason)],
    };
  }
  if (forceResolution.status === "ambiguous") {
    return { status: "needs_review", candidate, reason: `forceEvidence: ${forceResolution.reason}` };
  }

  return { status: "resolved", candidate: { ...candidate, forceWarrant: forceResolution.warrant } };
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
