import type { CandidateSourceRelationship, RelationshipWarrantError, ValidatedSourceRelationship } from "../types/authority.ts";
import type { SourceStore } from "../warrant/sourceStore.ts";

function rerr(relationshipId: string, field: string, message: string): RelationshipWarrantError {
  return { relationshipId, field, message };
}

const KNOWN_TYPES = new Set(["GOVERNS", "IMPLEMENTS", "EXTENDS", "SUPERSEDES", "GUIDANCE_FOR"]);

export type RelationshipWarrantOutcome =
  | { readonly status: "auto_promotable"; readonly relationship: ValidatedSourceRelationship }
  | { readonly status: "needs_review"; readonly candidate: CandidateSourceRelationship; readonly reason: string }
  | { readonly status: "rejected"; readonly errors: RelationshipWarrantError[] };

/**
 * The lineage-layer counterpart of warrant/warrantValidator.ts#checkWarrant.
 * Deterministically confirms, offline, that a proposed source relationship
 * (e.g. "this college page IMPLEMENTS the campus-wide policy") is actually
 * asserted by captured source text -- not merely that the model claims a
 * relationship type and cites a source id. Matching
 * CandidateSourceRelationship's shape proves nothing: a fabricated quote,
 * a self-referential edge, or a warrant anchored in the wrong source are
 * all rejected before the relationship can ever be used by
 * authority/authorityResolver.ts to select or exclude a governing source.
 *
 * The warrant must always be anchored in `fromSourceId`'s own captured
 * content -- by convention (see types/authority.ts), the "from" party of
 * every relation type is the document making the lineage claim, whichever
 * direction of authority that claim asserts. A warrant pointing at
 * `toSourceId` or any other source is rejected, not silently accepted as
 * "close enough."
 *
 * Only "directly_stated" claims with a verified span are auto-promotable.
 * "inferred" claims (the model's own reading of two pages, e.g. concluding
 * a supersession from a title date) fail into review -- precedence is
 * never inferred from URL/domain/title, only from a directly asserted,
 * verified quote.
 */
export function checkRelationshipWarrant(
  candidate: CandidateSourceRelationship,
  store: SourceStore
): RelationshipWarrantOutcome {
  const errors: RelationshipWarrantError[] = [];

  if (!candidate.fromSourceId || candidate.fromSourceId.trim().length === 0) {
    errors.push(rerr(candidate.id, "fromSourceId", "missing fromSourceId"));
  }
  if (!candidate.toSourceId || candidate.toSourceId.trim().length === 0) {
    errors.push(rerr(candidate.id, "toSourceId", "missing toSourceId"));
  }
  if (
    candidate.fromSourceId &&
    candidate.toSourceId &&
    candidate.fromSourceId.trim() === candidate.toSourceId.trim()
  ) {
    errors.push(rerr(candidate.id, "toSourceId", "fromSourceId and toSourceId must be different sources"));
  }
  if (!candidate.type || !KNOWN_TYPES.has(candidate.type)) {
    errors.push(rerr(candidate.id, "type", `missing or unrecognized relationship type: ${String(candidate.type)}`));
  }

  if (errors.length > 0) {
    return { status: "rejected", errors };
  }

  const w = candidate.warrant;
  if (!w) {
    return { status: "rejected", errors: [rerr(candidate.id, "warrant", "warrant is missing entirely")] };
  }

  if (!w.sourceId || w.sourceId.trim().length === 0) {
    errors.push(rerr(candidate.id, "warrant.sourceId", "missing source id"));
  }
  if (!w.quotedText || w.quotedText.length === 0) {
    errors.push(rerr(candidate.id, "warrant.quotedText", "missing quoted text"));
  }
  if (
    !w.span ||
    !Number.isInteger(w.span.start) ||
    !Number.isInteger(w.span.end) ||
    w.span.start < 0 ||
    w.span.end <= w.span.start
  ) {
    errors.push(
      rerr(candidate.id, "warrant.span", "missing or ambiguous span: start/end must be integers with end > start >= 0")
    );
  }
  if (w.claimType !== "directly_stated" && w.claimType !== "inferred") {
    errors.push(rerr(candidate.id, "warrant.claimType", `missing or unrecognized claimType: ${String(w.claimType)}`));
  }
  if (!w.contentHash || w.contentHash.trim().length === 0) {
    errors.push(rerr(candidate.id, "warrant.contentHash", "missing content hash"));
  }

  if (errors.length > 0) {
    return { status: "rejected", errors };
  }

  if (w.sourceId !== candidate.fromSourceId) {
    return {
      status: "rejected",
      errors: [
        rerr(
          candidate.id,
          "warrant.sourceId",
          `relationship warrant must be anchored in fromSourceId's own captured content -- warrant cites '${w.sourceId}' but fromSourceId is '${candidate.fromSourceId}'`
        ),
      ],
    };
  }

  const source = store.get(w.sourceId);
  if (!source) {
    return {
      status: "rejected",
      errors: [rerr(candidate.id, "warrant.sourceId", `no captured source artifact found for source id '${w.sourceId}'`)],
    };
  }

  if (source.contentHash !== w.contentHash) {
    return {
      status: "rejected",
      errors: [
        rerr(
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
        rerr(
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
        rerr(
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
        "evidence span verified against the captured source, but claimType is 'inferred' -- an inferred lineage claim requires human review and is never auto-promoted into authority resolution",
    };
  }

  return {
    status: "auto_promotable",
    relationship: Object.freeze({
      id: candidate.id,
      type: candidate.type,
      fromSourceId: candidate.fromSourceId,
      toSourceId: candidate.toSourceId,
      warrant: Object.freeze({ ...w }),
    }),
  };
}
