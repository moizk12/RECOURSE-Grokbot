import type { ApplicabilityScope, PolicySource, ValidatedSourceRelationship } from "../types/authority.ts";

/**
 * What a case needs a governing source for: one institution, one decision
 * type, at evaluation instant `asOf` (never wall-clock -- same discipline
 * as case/caseTwin.ts#computeCaseState's evaluationAt). `unit`/`studentType`
 * narrow the query to a specific college/department/program or student
 * population when the case is known to involve one.
 */
export interface AuthorityQuery {
  readonly institution: string;
  readonly decisionType: string;
  readonly unit?: string;
  readonly studentType?: string;
  readonly asOf: string;
}

export type AuthorityResolution =
  | {
      readonly status: "APPLICABLE";
      readonly governingSourceId: string;
      /** Subordinate sources (via validated IMPLEMENTS/EXTENDS/GOVERNS edges) that may supply non-contradictory detail alongside the governing source. */
      readonly supportingSourceIds: ReadonlyArray<string>;
      readonly reason: string;
    }
  | {
      readonly status: "BLOCKED_SOURCE_UNAVAILABLE";
      readonly reason: string;
    }
  | {
      readonly status: "BLOCKED_SOURCE_CONFLICT";
      readonly candidateSourceIds: ReadonlyArray<string>;
      readonly reason: string;
    };

function norm(s: string): string {
  return s.trim().toLowerCase();
}

function scopeMatches(scope: ApplicabilityScope, query: AuthorityQuery): boolean {
  if (norm(scope.institution) !== norm(query.institution)) return false;

  if (scope.excludes?.some((x) => norm(x) === norm(query.decisionType))) return false;
  if (!scope.decisionTypes.some((dt) => norm(dt) === norm(query.decisionType))) return false;

  // A source scoped to a specific unit only matches a query that names that
  // same unit. A query silent on unit is treated as campus-wide-only --
  // matching a college-level source by default would be exactly the
  // silent, unwarranted precedence guess this layer exists to prevent.
  if (scope.unit && norm(scope.unit) !== norm(query.unit ?? "")) return false;

  // studentTypes is only applied when the query actually states one --
  // an unspecified query student type is not evidence the source doesn't apply.
  if (scope.studentTypes && query.studentType && !scope.studentTypes.some((st) => norm(st) === norm(query.studentType!))) {
    return false;
  }

  return true;
}

/**
 * Drops any source superseded, as of `asOf`, by a validated SUPERSEDES
 * relationship. A supersession only takes effect once the newer source's
 * own `effective.effectiveDate` has arrived -- if `asOf` predates it, the
 * OLDER version is still the one in force and the newer one is excluded
 * instead, exactly mirroring benchmarks/case-08-stale-policy.md ("policies
 * change" is not license to jump to the newest version before it governs).
 */
function applySupersession(
  candidates: ReadonlyMap<string, PolicySource>,
  relationships: ReadonlyArray<ValidatedSourceRelationship>,
  asOf: string
): Map<string, PolicySource> {
  const retired = new Set<string>();
  for (const rel of relationships) {
    if (rel.type !== "SUPERSEDES") continue;
    const newer = candidates.get(rel.fromSourceId);
    const older = candidates.get(rel.toSourceId);
    if (!newer || !older) continue;

    if (newer.effective.effectiveDate <= asOf) {
      retired.add(older.sourceId);
    } else {
      retired.add(newer.sourceId);
    }
  }

  const remaining = new Map<string, PolicySource>();
  for (const [id, source] of candidates) {
    if (!retired.has(id)) remaining.set(id, source);
  }
  return remaining;
}

interface ParentEdge {
  readonly parentId: string;
  readonly type: "GOVERNS" | "IMPLEMENTS" | "EXTENDS";
}

/**
 * Normalizes GOVERNS/IMPLEMENTS/EXTENDS into a single "is subordinate to"
 * parent pointer per source, restricted to edges whose both endpoints
 * survived scope-matching and supersession. GOVERNS is the one relation
 * type whose from/to direction is inverted relative to the other two (see
 * types/authority.ts) -- from is superior, so the parent pointer runs from
 * `toSourceId` up to `fromSourceId`.
 */
function buildParents(
  candidateIds: ReadonlySet<string>,
  relationships: ReadonlyArray<ValidatedSourceRelationship>
): Map<string, ParentEdge[]> {
  const parents = new Map<string, ParentEdge[]>();
  const add = (childId: string, parentId: string, type: ParentEdge["type"]) => {
    const list = parents.get(childId) ?? [];
    list.push({ parentId, type });
    parents.set(childId, list);
  };

  for (const rel of relationships) {
    if (!candidateIds.has(rel.fromSourceId) || !candidateIds.has(rel.toSourceId)) continue;
    if (rel.type === "IMPLEMENTS" || rel.type === "EXTENDS") {
      add(rel.fromSourceId, rel.toSourceId, rel.type);
    } else if (rel.type === "GOVERNS") {
      add(rel.toSourceId, rel.fromSourceId, rel.type);
    }
  }

  return parents;
}

/** All ancestors of `id` reachable via `parents`, or null the moment a cycle is detected. */
function ancestorsOf(id: string, parents: ReadonlyMap<string, ParentEdge[]>): Set<string> | null {
  const seen = new Set<string>();
  let current = id;
  const visiting = new Set<string>([id]);
  for (;;) {
    const edges = parents.get(current);
    if (!edges || edges.length === 0) return seen;
    // Multi-parent ambiguity is caught by the caller before this is invoked;
    // walk the first recorded parent.
    const next = edges[0]!.parentId;
    if (visiting.has(next)) return null;
    visiting.add(next);
    seen.add(next);
    current = next;
  }
}

/**
 * Determines exactly which PolicySource governs a decision, or refuses to
 * pick when it cannot. Only ValidatedSourceRelationship may participate --
 * there is no path from a model-proposed CandidateSourceRelationship into
 * this function without first passing authority/relationshipValidator.ts,
 * so precedence can never rest on an unwarranted claim.
 *
 * Mirrors STATE_MACHINE.md's existing BLOCKED_SOURCE_CONFLICT /
 * BLOCKED_SOURCE_UNAVAILABLE vocabulary on purpose: this resolver's output
 * is meant to gate case-state transitions using the same names the case
 * schema already defines for "cannot confidently pick a governing source."
 */
export function resolveAuthority(
  sources: ReadonlyArray<PolicySource>,
  relationships: ReadonlyArray<ValidatedSourceRelationship>,
  query: AuthorityQuery
): AuthorityResolution {
  const scopeMatched = new Map<string, PolicySource>();
  for (const s of sources) {
    if (scopeMatches(s.scope, query)) scopeMatched.set(s.sourceId, s);
  }

  if (scopeMatched.size === 0) {
    return {
      status: "BLOCKED_SOURCE_UNAVAILABLE",
      reason: `no PolicySource's applicability scope matches institution '${query.institution}', decision type '${query.decisionType}'`,
    };
  }

  const afterSupersession = applySupersession(scopeMatched, relationships, query.asOf);

  // GUIDANCE_FOR sources can never be selected as governing, regardless of
  // any other edge they carry -- SAFETY.md §1 treats this class of source
  // as never authoritative, full stop.
  const guidanceOnly = new Set(
    relationships
      .filter((r) => r.type === "GUIDANCE_FOR" && afterSupersession.has(r.fromSourceId))
      .map((r) => r.fromSourceId)
  );

  const governingCandidates = new Map<string, PolicySource>();
  for (const [id, s] of afterSupersession) {
    if (!guidanceOnly.has(id)) governingCandidates.set(id, s);
  }

  if (governingCandidates.size === 0) {
    return {
      status: "BLOCKED_SOURCE_UNAVAILABLE",
      reason: "every source matching this scope is validated as non-binding guidance (GUIDANCE_FOR); no governing source found",
    };
  }

  const candidateIds = new Set(governingCandidates.keys());
  const parents = buildParents(candidateIds, relationships);

  const multiParent = [...governingCandidates.keys()].filter((id) => (parents.get(id)?.length ?? 0) > 1);
  if (multiParent.length > 0) {
    return {
      status: "BLOCKED_SOURCE_CONFLICT",
      candidateSourceIds: [...candidateIds],
      reason: `source(s) ${multiParent.join(", ")} have more than one validated superior relationship recorded -- ambiguous lineage, cannot pick one without human review`,
    };
  }

  const roots = [...governingCandidates.keys()].filter((id) => (parents.get(id)?.length ?? 0) === 0);

  if (roots.length === 0) {
    return {
      status: "BLOCKED_SOURCE_CONFLICT",
      candidateSourceIds: [...candidateIds],
      reason: "validated lineage relationships form a cycle with no top-level governing source -- cannot pick one without human review",
    };
  }

  if (roots.length > 1) {
    return {
      status: "BLOCKED_SOURCE_CONFLICT",
      candidateSourceIds: roots,
      reason: `${roots.length} sources (${roots.join(", ")}) independently claim to govern this scope with no validated relationship between them -- see SAFETY.md §5, a human must designate which governs`,
    };
  }

  const [root] = roots;
  const others = [...governingCandidates.keys()].filter((id) => id !== root);

  const disconnected: string[] = [];
  for (const id of others) {
    const ancestors = ancestorsOf(id, parents);
    if (ancestors === null || !ancestors.has(root!)) {
      disconnected.push(id);
    }
  }

  if (disconnected.length > 0) {
    return {
      status: "BLOCKED_SOURCE_CONFLICT",
      candidateSourceIds: [root!, ...disconnected],
      reason: `source(s) ${disconnected.join(", ")} match this scope but have no validated relationship to '${root}' -- unrelated competing source(s), a human must resolve which governs`,
    };
  }

  return {
    status: "APPLICABLE",
    governingSourceId: root!,
    supportingSourceIds: others,
    reason:
      others.length === 0
        ? `'${root}' is the only source matching this scope with no unresolved competing claim`
        : `'${root}' is the top-level governing source; ${others.join(", ")} are validated as subordinate (implementing/extending) detail`,
  };
}
