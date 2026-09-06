import type { AuthorityResolution } from "./authorityResolver.ts";

/**
 * The single applicability gate.
 *
 * Recourse's central claim is that a correctly quoted passage from the WRONG
 * document must never become an executable rule. Warrant validation cannot
 * enforce that -- a fabricated quote and a perfectly accurate quote from an
 * inapplicable policy look identical to a span check. Only authority
 * resolution can, so every path that compiles source text into something
 * executable (policy rules AND conformance rules) runs through this gate
 * first.
 *
 * A source passes only if authority resolution actually reached APPLICABLE
 * and the cited source is either the resolved governing source or one of its
 * validated supporting (implementing/extending) sources. BLOCKED_SOURCE_CONFLICT
 * and BLOCKED_SOURCE_UNAVAILABLE both block everything: an unresolved
 * governing source is a question for a human, not a reason to fall back on
 * whichever source happens to be at hand.
 */
export type GateOutcome = { readonly ok: true } | { readonly ok: false; readonly reason: string };

export function allowedSourceIds(authority: AuthorityResolution): ReadonlySet<string> {
  if (authority.status !== "APPLICABLE") return new Set();
  return new Set([authority.governingSourceId, ...authority.supportingSourceIds]);
}

export function gateSourceId(authority: AuthorityResolution, sourceId: string | undefined): GateOutcome {
  if (authority.status !== "APPLICABLE") {
    return {
      ok: false,
      reason: `authority for this scope is not resolved (status: ${authority.status}) -- no rule may be compiled until a human resolves the governing source`,
    };
  }

  const allowed = allowedSourceIds(authority);
  if (!sourceId || !allowed.has(sourceId)) {
    return {
      ok: false,
      reason: `source '${sourceId}' is not part of the authority-resolved governing/supporting set {${[...allowed].join(", ")}} for this scope`,
    };
  }

  return { ok: true };
}
