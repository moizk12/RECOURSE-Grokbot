import type {
  CandidateSourceRelationship,
  RelationshipWarrantError,
  ValidatedSourceRelationship,
} from "../types/authority.ts";
import type { ClaimType } from "../types/warrant.ts";
import type { SourceStore } from "../warrant/sourceStore.ts";
import { resolveQuote } from "../warrant/resolveQuote.ts";
import { checkRelationshipWarrant, type RelationshipWarrantOutcome } from "./relationshipValidator.ts";

function rerr(relationshipId: string, field: string, message: string): RelationshipWarrantError {
  return { relationshipId, field, message };
}

/**
 * The lineage-layer counterpart of warrant/rawProposal.ts#RawClaimProposal:
 * the only shape an untrusted model may emit when proposing that one source
 * governs, implements, extends, supersedes, or is guidance for another.
 *
 * As with policy rules, there is no `contentHash` and no `span` field here.
 * The proposer says which relationship it believes holds and quotes the text
 * it read; warrant/resolveQuote.ts derives the hash and offsets, or refuses.
 * Precedence between institutional documents is exactly the kind of claim a
 * model is most tempted to infer from a URL or a page title, so this path
 * exists to make sure a lineage edge can only enter authority resolution
 * through the same verbatim-quote check every other claim passes.
 */
export interface RawRelationshipProposal {
  readonly relationship: Omit<CandidateSourceRelationship, "warrant">;
  readonly quotedText: string;
  readonly claimType: ClaimType;
}

export type RawRelationshipOutcome = RelationshipWarrantOutcome;

/**
 * Resolves a raw lineage proposal's quote against captured content and, only
 * if it resolves uniquely, hands the resulting candidate to the existing,
 * unchanged authority/relationshipValidator.ts.
 *
 * The quote is always resolved against `fromSourceId` -- the document making
 * the lineage claim -- matching the anchoring rule relationshipValidator.ts
 * already enforces. A proposer cannot redirect the check at some other
 * source, because it never supplies a warrant source id at all.
 */
export function proposeRawRelationship(proposal: RawRelationshipProposal, store: SourceStore): RawRelationshipOutcome {
  const rel = proposal.relationship;
  const resolution = resolveQuote(rel.fromSourceId, proposal.quotedText, proposal.claimType, store);

  if (resolution.status === "unresolvable") {
    return { status: "rejected", errors: [rerr(rel.id, `rawRelationship.${resolution.field}`, resolution.reason)] };
  }
  if (resolution.status === "ambiguous") {
    return { status: "needs_review", candidate: { ...rel }, reason: resolution.reason };
  }

  return checkRelationshipWarrant({ ...rel, warrant: resolution.warrant }, store);
}

export interface RawRelationshipBatchResult {
  readonly validated: ValidatedSourceRelationship[];
  readonly needsReview: ReadonlyArray<{ readonly candidate: CandidateSourceRelationship; readonly reason: string }>;
  readonly errors: ReadonlyArray<RelationshipWarrantError>;
}

/** Batch form of proposeRawRelationship. Never throws; partitions into three buckets. */
export function proposeRawRelationships(
  proposals: ReadonlyArray<RawRelationshipProposal>,
  store: SourceStore
): RawRelationshipBatchResult {
  const validated: ValidatedSourceRelationship[] = [];
  const needsReview: { candidate: CandidateSourceRelationship; reason: string }[] = [];
  const errors: RelationshipWarrantError[] = [];

  for (const proposal of proposals) {
    const outcome = proposeRawRelationship(proposal, store);
    if (outcome.status === "auto_promotable") {
      validated.push(outcome.relationship);
    } else if (outcome.status === "needs_review") {
      needsReview.push({ candidate: outcome.candidate, reason: outcome.reason });
    } else {
      errors.push(...outcome.errors);
    }
  }

  return { validated, needsReview, errors };
}
