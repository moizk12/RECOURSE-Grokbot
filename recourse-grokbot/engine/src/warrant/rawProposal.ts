import type { CandidatePolicyRule, ValidatedPolicyRule } from "../types/policy.ts";
import type { ClaimType, EvidenceWarrant, WarrantError } from "../types/warrant.ts";
import type { ValidationError } from "../validation/errors.ts";
import { proposeAndValidate } from "./pipeline.ts";
import type { PipelineBatchResult, PipelineOutcome } from "./pipeline.ts";
import type { SourceStore } from "./sourceStore.ts";

function werr(ruleId: string, field: string, message: string): WarrantError {
  return { ruleId, field, message };
}

/**
 * The only shape an untrusted model (Grok) may emit for an evidence-backed
 * claim. It supplies the rule claim itself, which source it is citing, the
 * exact text it believes supports the claim, and whether the claim is
 * directly stated or inferred -- nothing else. There is deliberately no
 * `contentHash` and no character `span` field here: resolveRawProposal below
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
 * Binds a RawClaimProposal to a captured SourceArtifact. Locates every exact,
 * verbatim occurrence of `quotedText` in the source's canonical content:
 *
 * - zero occurrences is rejected outright -- there is nothing to derive a
 *   hash or span from, and none is invented.
 * - more than one occurrence is routed to needs_review rather than guessed
 *   at -- this function never chooses an occurrence on the model's behalf.
 * - exactly one occurrence is resolved into a full EvidenceWarrant
 *   (contentHash taken from the captured source itself, span computed from
 *   the match's own offsets) and handed back as a candidate ready for
 *   warrant/pipeline.ts.
 *
 * Fail-closed throughout, same discipline as warrantValidator.ts: every
 * branch that cannot uniquely verify the quote returns rejected/needs_review,
 * never a guessed warrant.
 */
export function resolveRawProposal(proposal: RawClaimProposal, store: SourceStore): RawProposalOutcome {
  const ruleId = proposal.rule.id;
  const errors: WarrantError[] = [];

  if (!proposal.sourceId || proposal.sourceId.trim().length === 0) {
    errors.push(werr(ruleId, "rawProposal.sourceId", "missing source id"));
  }
  if (!proposal.quotedText || proposal.quotedText.length === 0) {
    errors.push(werr(ruleId, "rawProposal.quotedText", "missing quoted text"));
  }
  if (proposal.claimType !== "directly_stated" && proposal.claimType !== "inferred") {
    errors.push(
      werr(ruleId, "rawProposal.claimType", `missing or unrecognized claimType: ${String(proposal.claimType)}`)
    );
  }
  if (errors.length > 0) {
    return { status: "rejected", errors };
  }

  const source = store.get(proposal.sourceId);
  if (!source) {
    return {
      status: "rejected",
      errors: [
        werr(ruleId, "rawProposal.sourceId", `no captured source artifact found for source id '${proposal.sourceId}'`),
      ],
    };
  }

  const occurrences = findAllOccurrences(source.content, proposal.quotedText);

  if (occurrences.length === 0) {
    return {
      status: "rejected",
      errors: [
        werr(
          ruleId,
          "rawProposal.quotedText",
          `quoted text not found verbatim in captured source '${proposal.sourceId}' -- cannot derive a hash or span for text that does not exist in the source (stale proposal, or source has changed since the model read it)`
        ),
      ],
    };
  }

  if (occurrences.length > 1) {
    return {
      status: "needs_review",
      candidate: { ...proposal.rule },
      reason: `quoted text matches ${occurrences.length} distinct locations in source '${proposal.sourceId}' -- occurrence is ambiguous and must not be guessed; routed to human review`,
    };
  }

  const start = occurrences[0]!;
  const end = start + proposal.quotedText.length;
  const warrant: EvidenceWarrant = {
    sourceId: proposal.sourceId,
    contentHash: source.contentHash,
    span: { start, end },
    quotedText: proposal.quotedText,
    claimType: proposal.claimType,
  };

  return { status: "resolved", candidate: { ...proposal.rule, warrant } };
}

/** All start offsets of exact, possibly-overlapping occurrences of `needle` in `haystack`. */
function findAllOccurrences(haystack: string, needle: string): number[] {
  const indices: number[] = [];
  let from = 0;
  while (from <= haystack.length) {
    const idx = haystack.indexOf(needle, from);
    if (idx === -1) break;
    indices.push(idx);
    from = idx + 1;
  }
  return indices;
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
