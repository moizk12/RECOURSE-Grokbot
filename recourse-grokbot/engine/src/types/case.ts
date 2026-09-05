/**
 * Case Twin model: policy (ValidatedPolicyRule[]) describes what SHOULD happen.
 * CaseEvents describe what HAS happened. Case state is always derived by
 * comparing the two — it is never stored/mutated directly.
 */

export type CaseEventType =
  | "case_opened"
  | "decision_notice_received"
  | "grievance_filed" // the student's formal grievance/appeal reaches the institution, starting an institution obligation clock
  | "ground_asserted"
  | "evidence_provided"
  | "student_action_taken" // e.g. appeal filed
  | "institution_action_taken" // e.g. institution responded
  | "escalation_filed";

/** Append-only. Nothing in this codebase ever edits or removes a CaseEvent once logged. */
export interface CaseEvent {
  readonly eventId: string;
  readonly type: CaseEventType;
  /** ISO 8601 timestamp of when this event actually occurred (not when it was logged). */
  readonly occurredAt: string;
  readonly detail: Record<string, unknown>;
}

export type ObligationStatus = "pending" | "met" | "missed" | "unknown";

export interface ObligationState {
  readonly obligationId: string;
  readonly party: "student" | "institution";
  /** null when the deadline could not be computed (e.g. ambiguous trigger). */
  readonly dueAt: string | null;
  readonly status: ObligationStatus;
  readonly reason: string;
}

export type EligibilityResult = "eligible" | "ineligible" | "undetermined";

export interface EligibilityDetermination {
  readonly result: EligibilityResult;
  readonly reason: string;
  readonly citedRuleId?: string;
}

export interface CaseState {
  readonly asOf: string;
  readonly obligations: ReadonlyArray<ObligationState>;
  readonly eligibility: EligibilityDetermination;
}

export type DeviationType =
  | "STUDENT_REQUIREMENT_MISSING"
  | "STUDENT_DEADLINE_EXCEEDED"
  | "INSTITUTION_DEADLINE_EXCEEDED"
  | "POLICY_SOURCE_AMBIGUITY"
  | "CONFLICTING_RULES"
  | "MISSING_SOURCE_EVIDENCE"
  | "NORMAL_WAITING";

export interface Deviation {
  readonly type: DeviationType;
  readonly detail: string;
  readonly relatedObligationId?: string;
  readonly relatedRuleIds?: string[];
}
