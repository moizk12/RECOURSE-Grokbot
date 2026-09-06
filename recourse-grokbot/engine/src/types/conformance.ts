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
 * A waiver or exception the governing source ATTACHES TO THIS REQUIREMENT,
 * quoted from the source like everything else here.
 *
 * This exists because of a real provision in a real procedure. CWRU's Formal
 * Hearing Process says, in one list item: "The hearing date, time and
 * location will be communicated to the respondents at least five business
 * days prior to the hearing.&nbsp;A respondent may choose to waive this
 * notice in the interests of expediting resolution of the case." A checker
 * that knows only the first sentence will report a short-notice hearing as a
 * deterministic violation. That finding is not merely incomplete -- it is
 * capable of being flatly wrong, because a respondent who waived notice got
 * exactly the process the policy provides. A student who takes that finding
 * to a hearing panel is embarrassed by it, and every other finding in the
 * same record loses its credibility with them.
 *
 * The semantics are deliberately evidentiary, not interpretive. The engine
 * never decides whether a waiver "probably" happened:
 *
 *   `establishedByEventType` observed  -> the exception APPLIES.
 *   `negatedByEventType` observed      -> the exception is EXCLUDED, and the
 *                                         underlying violation stands.
 *   neither observed                   -> UNRESOLVED. The requirement may or
 *                                         may not have been violated, and the
 *                                         record does not say.
 *
 * The last branch is the entire point. ABSENCE OF A WAIVER EVENT IS NOT
 * EVIDENCE THAT NO WAIVER OCCURRED -- most case records simply will not
 * mention it. `negatedByEventType` is required rather than optional so that
 * every exception has a stated way to be ruled out affirmatively; without one
 * there would be no path back to a clean violation finding except by
 * assuming absence, which is the assumption this whole layer refuses to make.
 */
export interface ConformanceException {
  readonly id: string;
  /** Plain-language description of the exception, for the human-facing report. */
  readonly description: string;
  /** Observing this event type establishes that the exception applies. */
  readonly establishedByEventType: string;
  /** Observing this event type affirmatively establishes that the exception does NOT apply. */
  readonly negatedByEventType: string;
  /** Verified pointer to the source text creating the exception. Required on a validated rule, exactly like the rule's own warrant. */
  readonly warrant?: EvidenceWarrant;
}

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
  /** Optional waiver/exception the source attaches to this requirement. Verified exactly like the rule's own warrant. */
  readonly exception?: ConformanceException;
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
  /** Present only when the source states an exception, and then always with its own verified warrant. */
  readonly exception?: Readonly<ConformanceException & { readonly warrant: Readonly<EvidenceWarrant> }>;
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
export type ConformanceStatus = "CONFORMANT" | "NONCONFORMANT" | "UNDETERMINED" | "EXCEPTION_APPLIES";

/**
 * The exception dimension of a finding, reported alongside the status so the
 * four states a reader actually needs stay distinguishable:
 *
 *   requirement satisfied       -> CONFORMANT
 *   requirement violated        -> NONCONFORMANT      (exception NOT_APPLICABLE or EXCLUDED)
 *   exception/waiver applies    -> EXCEPTION_APPLIES  (exception APPLIES)
 *   exception state unresolved  -> UNDETERMINED       (exception UNRESOLVED)
 *
 * NOT_APPLICABLE means the rule carries no exception, or the requirement was
 * met so no exception was ever reached. It is never a claim that no exception
 * exists in the world.
 */
export type ExceptionState = "NOT_APPLICABLE" | "APPLIES" | "EXCLUDED" | "UNRESOLVED";

export interface ConformanceExceptionOutcome {
  readonly exceptionId: string;
  readonly state: ExceptionState;
  readonly description: string;
  readonly detail: string;
}

export interface ConformanceResult {
  readonly ruleId: string;
  readonly status: ConformanceStatus;
  readonly reason: string;
  /** Present only when the rule carries an exception. Absent means the source stated none, not that none applies. */
  readonly exception?: ConformanceExceptionOutcome;
}
