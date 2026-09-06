import type { ClaimType, EvidenceWarrant } from "../types/warrant.ts";
import type { SourceStore } from "./sourceStore.ts";

/**
 * The single place a model-supplied quote is turned into a checkable
 * EvidenceWarrant.
 *
 * Every one of the three trust boundaries in this engine (policy rules,
 * source relationships, conformance rules) accepts the SAME untrusted shape
 * from a proposer: "here is a source id, here is the text I claim supports
 * my claim, here is whether I read it directly or inferred it." None of them
 * accepts a `contentHash` or a character `span` from the proposer, because
 * this function is the only code allowed to produce those -- deterministically,
 * from a unique verbatim match against already-captured source content.
 *
 * Fail-closed, with the ambiguity distinction that matters:
 *   - zero occurrences  -> unresolvable. Nothing is invented.
 *   - many occurrences  -> ambiguous, routed to human review. This function
 *                          never picks an occurrence on the proposer's behalf.
 *   - one occurrence    -> resolved, with the hash taken from the captured
 *                          artifact itself and the span taken from the match's
 *                          own offsets.
 *
 * Extracted from warrant/rawProposal.ts (which was the first caller) so the
 * lineage and conformance layers get the identical guarantee rather than a
 * re-implementation that could drift from it.
 */
export type QuoteResolution =
  | { readonly status: "resolved"; readonly warrant: EvidenceWarrant }
  | { readonly status: "ambiguous"; readonly occurrences: number; readonly reason: string }
  | { readonly status: "unresolvable"; readonly field: string; readonly reason: string };

export function resolveQuote(
  sourceId: string | undefined,
  quotedText: string | undefined,
  claimType: ClaimType | undefined,
  store: SourceStore
): QuoteResolution {
  if (!sourceId || sourceId.trim().length === 0) {
    return { status: "unresolvable", field: "sourceId", reason: "missing source id" };
  }
  if (!quotedText || quotedText.length === 0) {
    return { status: "unresolvable", field: "quotedText", reason: "missing quoted text" };
  }
  if (claimType !== "directly_stated" && claimType !== "inferred") {
    return {
      status: "unresolvable",
      field: "claimType",
      reason: `missing or unrecognized claimType: ${String(claimType)}`,
    };
  }

  const source = store.get(sourceId);
  if (!source) {
    return {
      status: "unresolvable",
      field: "sourceId",
      reason: `no captured source artifact found for source id '${sourceId}'`,
    };
  }

  const occurrences = findAllOccurrences(source.content, quotedText);

  if (occurrences.length === 0) {
    return {
      status: "unresolvable",
      field: "quotedText",
      reason:
        `quoted text not found verbatim in captured source '${sourceId}' -- cannot derive a hash or span ` +
        `for text that does not exist in the source (stale proposal, or source has changed since the model read it)`,
    };
  }

  if (occurrences.length > 1) {
    return {
      status: "ambiguous",
      occurrences: occurrences.length,
      reason: `quoted text matches ${occurrences.length} distinct locations in source '${sourceId}' -- occurrence is ambiguous and must not be guessed; routed to human review`,
    };
  }

  const start = occurrences[0]!;
  return {
    status: "resolved",
    warrant: {
      sourceId,
      contentHash: source.contentHash,
      span: { start, end: start + quotedText.length },
      quotedText,
      claimType,
    },
  };
}

/** All start offsets of exact, possibly-overlapping occurrences of `needle` in `haystack`. */
export function findAllOccurrences(haystack: string, needle: string): number[] {
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
