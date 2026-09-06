/**
 * Policy source authority/lineage model.
 *
 * A PolicySource is the compiled-policy-level counterpart of a
 * warrant/warrant.ts SourceArtifact: one candidate governing document for
 * one institution, at one authority level, applicable to some declared
 * scope. Real institutions routinely publish several documents that could
 * each plausibly govern the same decision (a campus-wide policy, a college
 * page, an office's procedural FAQ) -- see benchmarks/case-07-conflicting-sources.md.
 * Recourse must resolve exactly which PolicySource governs a given
 * decision before any ValidatedPolicyRule compiled from it is used to gate
 * a case. That resolution is authority/authorityResolver.ts; this file is
 * only the data model it operates on.
 *
 * Distinct sources relate to each other in one of five ways. Direction is
 * fixed per relation type, always read as "fromSourceId <TYPE> toSourceId":
 *
 *   GOVERNS      fromSourceId is authoritative over toSourceId's scope
 *                (from outranks to; to is subordinate).
 *   IMPLEMENTS   fromSourceId operationalizes toSourceId (from is a
 *                procedural/operational detail page for to's rule; from is
 *                subordinate and must not contradict to).
 *   EXTENDS      fromSourceId adds scope-specific detail on top of
 *                toSourceId (e.g. a college elaborating a campus policy;
 *                from is subordinate and must not contradict to).
 *   SUPERSEDES   fromSourceId (the newer document) replaces toSourceId as
 *                of fromSourceId's own effective date -- not a hierarchy
 *                edge, a temporal-replacement edge.
 *   GUIDANCE_FOR fromSourceId is non-binding guidance/explanation for
 *                toSourceId. fromSourceId can never be selected as a
 *                governing source, regardless of any other edge it carries
 *                -- see SAFETY.md §1's "level 4 sources are never
 *                authoritative."
 *
 * As with policy rules, the model may PROPOSE a relationship
 * (CandidateSourceRelationship) after reading two source pages, but a
 * relationship only participates in authority resolution once it is
 * source-warranted -- verified, deterministically and offline, against a
 * previously captured SourceArtifact's actual content (see
 * authority/relationshipValidator.ts). Precedence is never inferred from a
 * source's URL, domain, or title; only from a validated quoted span that
 * actually asserts the relationship.
 */

import type { EvidenceWarrant } from "./warrant.ts";

export type SourceRelationType = "GOVERNS" | "IMPLEMENTS" | "EXTENDS" | "SUPERSEDES" | "GUIDANCE_FOR";

export type AuthorityLevel = "campus_wide" | "college_level" | "department_level" | "program_level";

/**
 * What a PolicySource claims to be applicable to. Mirrors POLICY_IR.md's
 * `authority`/`trigger` sections. `excludes` takes priority over
 * `decisionTypes` -- an explicit negative scope always wins over an
 * enumerated positive one.
 */
export interface ApplicabilityScope {
  readonly institution: string;
  /** Set only for a source scoped below campus-wide (a specific college/department/program). */
  readonly unit?: string;
  readonly decisionTypes: ReadonlyArray<string>;
  readonly studentTypes?: ReadonlyArray<string>;
  readonly excludes?: ReadonlyArray<string>;
}

/**
 * When a source's terms are in force. `versionId` is opaque metadata for
 * audit trails only -- resolution never compares versionIds, only
 * `effectiveDate` against the caller-supplied evaluation instant, and only
 * via a validated SUPERSEDES relationship (see authorityResolver.ts).
 */
export interface EffectiveWindow {
  readonly effectiveDate: string;
  readonly versionId?: string;
}

export interface PolicySource {
  readonly sourceId: string;
  readonly institution: string;
  readonly authorityLevel: AuthorityLevel;
  readonly scope: Readonly<ApplicabilityScope>;
  readonly effective: Readonly<EffectiveWindow>;
}

/**
 * Untrusted input -- whatever the model proposed after comparing two
 * source pages. `warrant` must be missing on the type (not just possibly
 * absent) the same way CandidatePolicyRule's is: this is exactly the shape
 * an LLM may emit, and the warrant checker treats a missing warrant as an
 * automatic reject, never a default.
 */
export interface CandidateSourceRelationship {
  readonly id: string;
  readonly type: SourceRelationType;
  readonly fromSourceId: string;
  readonly toSourceId: string;
  readonly warrant?: EvidenceWarrant;
}

/**
 * A relationship that has passed authority/relationshipValidator.ts. There
 * is no other constructor for this type, and authorityResolver.ts accepts
 * nothing else -- a CandidateSourceRelationship can never reach the
 * resolver directly.
 */
export interface ValidatedSourceRelationship {
  readonly id: string;
  readonly type: SourceRelationType;
  readonly fromSourceId: string;
  readonly toSourceId: string;
  readonly warrant: Readonly<EvidenceWarrant>;
}

export interface RelationshipWarrantError {
  readonly relationshipId: string;
  readonly field: string;
  readonly message: string;
}
