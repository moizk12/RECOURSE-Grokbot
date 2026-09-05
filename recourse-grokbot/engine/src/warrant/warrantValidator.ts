import type { CandidatePolicyRule } from "../types/policy.ts";
import type { WarrantError } from "../types/warrant.ts";
import type { SourceStore } from "./sourceStore.ts";

function werr(ruleId: string, field: string, message: string): WarrantError {
  return { ruleId, field, message };
}

export type WarrantOutcome =
  | { readonly status: "auto_promotable"; readonly candidate: CandidatePolicyRule }
  | { readonly status: "needs_review"; readonly candidate: CandidatePolicyRule; readonly reason: string }
  | { readonly status: "rejected"; readonly errors: WarrantError[] };

/**
 * Stage 0 of the pipeline, ahead of validation/provenanceValidator.ts and
 * validation/ruleValidator.ts. Deterministically confirms, offline, that a
 * candidate's cited evidence actually exists in a previously captured
 * source -- not merely that the candidate *claims* a source id and a quote.
 * Matching CandidatePolicyRule's schema proves nothing here: a fabricated
 * quote, a wrong sourceId, a stale content hash, or a missing/ambiguous span
 * are all rejected before the candidate is ever handed to structural
 * validation. Fail-closed throughout, same discipline as ruleValidator.ts --
 * every branch that cannot verify what it needs returns rejected/needs_review
 * rather than assuming the candidate is fine.
 *
 * Only claimType "directly_stated" candidates with a verified span are
 * auto-promotable into the existing rule-validation pipeline. "inferred"
 * candidates fail into review even when the cited evidence checks out
 * exactly -- an LLM's interpretation of a policy is never, by itself,
 * sufficient for an executable rule in this MVP.
 */
export function checkWarrant(candidate: CandidatePolicyRule, store: SourceStore): WarrantOutcome {
  const w = candidate.warrant;

  if (!w) {
    return { status: "rejected", errors: [werr(candidate.id, "warrant", "warrant is missing entirely")] };
  }

  const errors: WarrantError[] = [];

  if (!w.sourceId || w.sourceId.trim().length === 0) {
    errors.push(werr(candidate.id, "warrant.sourceId", "missing source id"));
  }
  if (!w.quotedText || w.quotedText.length === 0) {
    errors.push(werr(candidate.id, "warrant.quotedText", "missing quoted text"));
  }
  if (
    !w.span ||
    !Number.isInteger(w.span.start) ||
    !Number.isInteger(w.span.end) ||
    w.span.start < 0 ||
    w.span.end <= w.span.start
  ) {
    errors.push(
      werr(candidate.id, "warrant.span", "missing or ambiguous span: start/end must be integers with end > start >= 0")
    );
  }
  if (w.claimType !== "directly_stated" && w.claimType !== "inferred") {
    errors.push(werr(candidate.id, "warrant.claimType", `missing or unrecognized claimType: ${String(w.claimType)}`));
  }
  if (!w.contentHash || w.contentHash.trim().length === 0) {
    errors.push(werr(candidate.id, "warrant.contentHash", "missing content hash"));
  }

  if (errors.length > 0) {
    return { status: "rejected", errors };
  }

  const source = store.get(w.sourceId);
  if (!source) {
    return {
      status: "rejected",
      errors: [werr(candidate.id, "warrant.sourceId", `no captured source artifact found for source id '${w.sourceId}'`)],
    };
  }

  if (source.contentHash !== w.contentHash) {
    return {
      status: "rejected",
      errors: [
        werr(
          candidate.id,
          "warrant.contentHash",
          `content hash mismatch: candidate pins '${w.contentHash}' but captured source '${w.sourceId}' has '${source.contentHash}' -- source has changed since capture, or the wrong hash was cited`
        ),
      ],
    };
  }

  const { start, end } = w.span;
  if (end > source.content.length) {
    return {
      status: "rejected",
      errors: [
        werr(
          candidate.id,
          "warrant.span",
          `span [${start}, ${end}) is out of bounds for source '${w.sourceId}' (captured content length ${source.content.length})`
        ),
      ],
    };
  }

  const actualSpanText = source.content.slice(start, end);
  if (actualSpanText !== w.quotedText) {
    return {
      status: "rejected",
      errors: [
        werr(
          candidate.id,
          "warrant.quotedText",
          `cited evidence could not be confirmed: candidate quotes '${w.quotedText}' at [${start}, ${end}), but the captured source actually has '${actualSpanText}' there`
        ),
      ],
    };
  }

  if (w.claimType === "inferred") {
    return {
      status: "needs_review",
      candidate,
      reason:
        "evidence span verified against the captured source, but claimType is 'inferred' -- interpretive/inferred rules require human review before becoming executable and are never auto-promoted",
    };
  }

  return { status: "auto_promotable", candidate };
}
