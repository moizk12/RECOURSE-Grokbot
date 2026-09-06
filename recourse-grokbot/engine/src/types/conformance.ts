/**
 * Procedural conformance model.
 *
 * types/policy.ts governs whether a RULE is executable; types/authority.ts
 * governs whether a SOURCE is the one that governs a decision. This file is
 * the third and last trust boundary: whether what actually HAPPENED in a
 * case (the append-only CaseEvent trace, see case/eventLog.ts) conforms to
 * a validated procedural constraint compiled from that governing source.
 *
 * Kept deliberately narrow to three constraint shapes -- every notice,
 * disclosure, and sequencing requirement in the hearing procedures this
 * layer was built against (see benchmarks and conformance/conformanceChecker.ts)
 * reduces to one of these:
 *
 *   required_event      some event type must appear in the case's trace at all.
 *   required_before      one event type must occur strictly before another.
 *   minimum_lead_time    the gap between two event types must be at least
 *                         N business/calendar days.
 *
 * As with policy rules and source relationships, a model may PROPOSE a
 * conformance rule (CandidateConformanceRule), but it only becomes a
 * ValidatedConformanceRule via conformance/conformanceValidator.ts --
 * which requires a verified source warrant, exactly like the other two
 * trust boundaries. Uniquely among the three, a conformance rule also
 * cannot become executable via conformance/conformancePipeline.ts unless
 * its cited source has already cleared authority/authorityResolver.ts as
 * APPLICABLE for the scope in question: a rule compiled from a source
 * still in BLOCKED_SOURCE_CONFLICT or BLOCKED_SOURCE_UNAVAILABLE can never
 * be produced, no matter how well warranted its own text is.
 */

import type { EvidenceWarrant } from "./warrant.ts";
import type { TimeUnit } from "./policy.ts";

/**
 * Some event type must appear in the case's trace. `closesUponEventType`
 * is optional and load-bearing: without it, absence of `eventType` can
 * never be concluded to be a violation (the window is, as far as this
 * rule alone is concerned, permanently open) -- see
 * conformance/conformanceChecker.ts. With it, absence becomes
 * NONCONFORMANT only once `closesUponEventType` has actually been
 * observed in the trace, never merely because a wall-clock deadline has
 * passed.
 */
export interface RequiredEventConstraint {
  readonly kind: "required_event";
  readonly eventType: string;
  readonly closesUponEventType?: string;
}

/** `eventType` must occur strictly before `beforeEventType`. */
export interface RequiredBeforeConstraint {
  readonly kind: "required_before";
  readonly eventType: string;
  readonly beforeEventType: string;
}

/** The gap between `anchorEventType` and `targetEventType` must be at least `minimum`. */
export interface MinimumLeadTimeConstraint {
  readonly kind: "minimum_lead_time";
  readonly anchorEventType: string;
  readonly targetEventType: string;
  readonly minimum: { readonly amount: number; readonly unit: TimeUnit };
}

export type ConformanceConstraint = RequiredEventConstraint | RequiredBeforeConstraint | MinimumLeadTimeConstraint;

/**
 * Untrusted input -- whatever the model proposed after reading a governing
 * source. `sourceId` identifies which PolicySource this rule claims to be
 * compiled from; conformance/conformancePipeline.ts checks that id against
 * an AuthorityResolution before the rule is ever warrant-checked.
 */
export interface CandidateConformanceRuleBase {
  readonly id: string;
  readonly sourceId: string | undefined;
  /** Who is bound by this procedural requirement (e.g. "institution", "student"). */
  readonly actor: string | undefined;
  readonly constraint: ConformanceConstraint | undefined;
  readonly warrant?: EvidenceWarrant;
}
export type CandidateConformanceRule = CandidateConformanceRuleBase;

/**
 * A conformance rule that has passed conformance/conformanceValidator.ts.
 * There is no other constructor for this type, and
 * conformance/conformanceChecker.ts accepts nothing else.
 */
export interface ValidatedConformanceRule {
  readonly id: string;
  readonly sourceId: string;
  readonly actor: string;
  readonly constraint: Readonly<ConformanceConstraint>;
  readonly warrant: Readonly<EvidenceWarrant>;
}

export interface ConformanceRuleError {
  readonly ruleId: string;
  readonly field: string;
  readonly message: string;
}

/**
 * UNDETERMINED is not a residual "error" bucket -- it is the correct,
 * expected result whenever the case's trace does not yet contain enough
 * observed events to decide CONFORMANT or NONCONFORMANT. See
 * conformance/conformanceChecker.ts for exactly which observed events are
 * required before each constraint kind may resolve to NONCONFORMANT.
 */
export type ConformanceStatus = "CONFORMANT" | "NONCONFORMANT" | "UNDETERMINED";

export interface ConformanceResult {
  readonly ruleId: string;
  readonly status: ConformanceStatus;
  readonly reason: string;
}
