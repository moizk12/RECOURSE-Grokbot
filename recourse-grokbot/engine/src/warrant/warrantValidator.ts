import type { CandidatePolicyRule, DeonticForce } from "../types/policy.ts";
import type { EvidenceWarrant, WarrantError } from "../types/warrant.ts";
import type { SourceStore } from "./sourceStore.ts";
import { checkDeonticSupport } from "../validation/deonticSupport.ts";

function werr(ruleId: string, field: string, message: string): WarrantError {
  return { ruleId, field, message };
}

/**
 * Every structural and evidential check one EvidenceWarrant must pass, in one
 * place so a rule's primary warrant and its optional force-evidence warrant
 * are held to exactly the same standard. Returns [] when the warrant is
 * verified; the caller decides what a failure means for that particular
 * pointer.
 */
function verifyWarrantSpan(ruleId: string, field: string, w: EvidenceWarrant | undefined, store: SourceStore): WarrantError[] {
  if (!w) return [werr(ruleId, field, "warrant is missing entirely")];

  const errors: WarrantError[] = [];

  if (!w.sourceId || w.sourceId.trim().length === 0) {
    errors.push(werr(ruleId, `${field}.sourceId`, "missing source id"));
  }
  if (!w.quotedText || w.quotedText.length === 0) {
    errors.push(werr(ruleId, `${field}.quotedText`, "missing quoted text"));
  }
  if (
    !w.span ||
    !Number.isInteger(w.span.start) ||
    !Number.isInteger(w.span.end) ||
    w.span.start < 0 ||
    w.span.end <= w.span.start
  ) {
    errors.push(
      werr(ruleId, `${field}.span`, "missing or ambiguous span: start/end must be integers with end > start >= 0")
    );
  }
  if (w.claimType !== "directly_stated" && w.claimType !== "inferred") {
    errors.push(werr(ruleId, `${field}.claimType`, `missing or unrecognized claimType: ${String(w.claimType)}`));
  }
  if (!w.contentHash || w.contentHash.trim().length === 0) {
    errors.push(werr(ruleId, `${field}.contentHash`, "missing content hash"));
  }

  if (errors.length > 0) return errors;

  const source = store.get(w.sourceId);
  if (!source) {
    return [werr(ruleId, `${field}.sourceId`, `no captured source artifact found for source id '${w.sourceId}'`)];
  }

  if (source.contentHash !== w.contentHash) {
    return [
      werr(
        ruleId,
        `${field}.contentHash`,
        `content hash mismatch: candidate pins '${w.contentHash}' but captured source '${w.sourceId}' has '${source.contentHash}' -- source has changed since capture, or the wrong hash was cited`
      ),
    ];
  }

  const { start, end } = w.span;
  if (end > source.content.length) {
    return [
      werr(
        ruleId,
        `${field}.span`,
        `span [${start}, ${end}) is out of bounds for source '${w.sourceId}' (captured content length ${source.content.length})`
      ),
    ];
  }

  const actualSpanText = source.content.slice(start, end);
  if (actualSpanText !== w.quotedText) {
    return [
      werr(
        ruleId,
        `${field}.quotedText`,
        `cited evidence could not be confirmed: candidate quotes '${w.quotedText}' at [${start}, ${end}), but the captured source actually has '${actualSpanText}' there`
      ),
    ];
  }

  return [];
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
 *
 * A verified span still does not prove the span SAYS what the candidate
 * claims. For one specific, high-consequence dimension -- whether the rule is
 * BINDING -- that gap is closed here by validation/deonticSupport.ts, which
 * is consulted only for candidates claiming a binding force. See that module
 * for exactly how narrow the check is and why it fails closed.
 */
export function checkWarrant(candidate: CandidatePolicyRule, store: SourceStore): WarrantOutcome {
  const w = candidate.warrant;

  if (!w) {
    return { status: "rejected", errors: [werr(candidate.id, "warrant", "warrant is missing entirely")] };
  }

  const errors = verifyWarrantSpan(candidate.id, "warrant", w, store);
  if (errors.length > 0) {
    return { status: "rejected", errors };
  }

  if (w.claimType === "inferred") {
    return {
      status: "needs_review",
      candidate,
      reason:
        "evidence span verified against the captured source, but claimType is 'inferred' -- interpretive/inferred rules require human review before becoming executable and are never auto-promoted",
    };
  }

  // Optional second pointer, verified to the identical standard. A
  // force-evidence warrant that does not itself check out is a rejection, not
  // something to quietly ignore: it was offered as evidence.
  const fw = candidate.forceWarrant;
  if (fw) {
    const forceErrors = verifyWarrantSpan(candidate.id, "forceWarrant", fw, store);
    if (forceErrors.length > 0) {
      return { status: "rejected", errors: forceErrors };
    }
    if (fw.claimType === "inferred") {
      return {
        status: "needs_review",
        candidate,
        reason:
          "forceEvidence span verified against the captured source, but its claimType is 'inferred' -- an inferred reading may not establish that a rule is binding",
      };
    }
  }

  const spans = [
    { label: "warrant", text: w.quotedText },
    ...(fw ? [{ label: "forceEvidence", text: fw.quotedText }] : []),
  ];
  // An absent or unrecognized force is not this gate's problem -- it is
  // rejected a stage later by validation/ruleValidator.ts, which is the one
  // place that decides what a valid force even is. Passing it through
  // unchanged keeps that single point of truth intact.
  const deontic = checkDeonticSupport(candidate.deonticForce as DeonticForce, spans);

  if (deontic.status === "contradicted") {
    return { status: "rejected", errors: [werr(candidate.id, "deonticForce", deontic.reason)] };
  }
  if (deontic.status === "unsupported") {
    return { status: "needs_review", candidate, reason: deontic.reason };
  }

  return { status: "auto_promotable", candidate };
}
