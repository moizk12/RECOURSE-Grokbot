import type { CaseState, Deviation } from "../types/case.ts";
import type { ProcedureModel } from "../procedure/procedureModel.ts";
import type { RuleConflict } from "../procedure/procedureModel.ts";
import type { CaseEventLog } from "../case/eventLog.ts";
import type { ValidationError } from "../validation/errors.ts";

export interface DeviationInputs {
  readonly procedure: ProcedureModel;
  readonly caseState: CaseState;
  readonly log: CaseEventLog;
  readonly conflicts: ReadonlyArray<RuleConflict>;
  /** Rejected candidate rules from the validation stage — surfaced, never silently dropped. */
  readonly rejectedRuleErrors: ReadonlyArray<ValidationError>;
  /** Policy-level ambiguity notes (e.g. two differently-scoped sources with an open question) that are NOT structural rule conflicts. */
  readonly sourceAmbiguities: ReadonlyArray<string>;
}

/**
 * Procedural deviation detection. Every case-state snapshot produces at least
 * one deviation entry per relevant obligation/gate — including NORMAL_WAITING,
 * which is a first-class, non-alarming result and not the absence of output.
 */
export function detectDeviations(inputs: DeviationInputs): Deviation[] {
  const deviations: Deviation[] = [];
  const { procedure, caseState, log, conflicts, rejectedRuleErrors, sourceAmbiguities } = inputs;

  for (const obligation of caseState.obligations) {
    if (obligation.status === "missed") {
      deviations.push({
        type: obligation.party === "student" ? "STUDENT_DEADLINE_EXCEEDED" : "INSTITUTION_DEADLINE_EXCEEDED",
        detail: obligation.reason,
        relatedObligationId: obligation.obligationId,
      });
    } else if (obligation.status === "pending") {
      deviations.push({
        type: "NORMAL_WAITING",
        detail: `awaiting ${obligation.party} obligation ${obligation.obligationId}: ${obligation.reason}`,
        relatedObligationId: obligation.obligationId,
      });
    }
    // status "unknown" (blocked trigger / no deadline) and "met" obligations
    // are not deviations by themselves; unknown trigger ambiguity is reported
    // separately below via evidence gates / conflicts / ambiguity notes so it
    // is never silently absorbed into NORMAL_WAITING.
  }

  for (const gate of procedure.evidenceGates) {
    if (gate.deonticForce !== "MUST" && gate.deonticForce !== "SHALL") continue;
    const groundId = gate.conditions.find((c) => c.id === "ground_id")?.description;
    const evidenceType = gate.action;
    const provided = log.ofType("evidence_provided").some((e) => e.detail["evidenceType"] === evidenceType);
    if (!provided) {
      deviations.push({
        type: "STUDENT_REQUIREMENT_MISSING",
        detail: `required evidence not yet provided: ${evidenceType}${groundId ? ` (ground: ${groundId})` : ""}`,
        relatedRuleIds: [gate.id],
      });
    }
  }

  for (const conflict of conflicts) {
    deviations.push({
      type: "CONFLICTING_RULES",
      detail: conflict.reason,
      relatedRuleIds: [conflict.ruleIdA, conflict.ruleIdB],
    });
  }

  for (const rejected of rejectedRuleErrors) {
    deviations.push({
      type: "MISSING_SOURCE_EVIDENCE",
      detail: `rule "${rejected.ruleId}" rejected at validation: ${rejected.field} — ${rejected.message}`,
      relatedRuleIds: [rejected.ruleId],
    });
  }

  for (const ambiguity of sourceAmbiguities) {
    deviations.push({ type: "POLICY_SOURCE_AMBIGUITY", detail: ambiguity });
  }

  // Only surface eligibility ambiguity as a deviation when the procedure
  // actually defines eligibility grounds to evaluate against. A procedure
  // with no eligibility_grounds rules (e.g. a two-sided-deadline-only model
  // that hasn't reached a grounds-gated stage) has nothing to be ambiguous
  // about yet — reporting POLICY_SOURCE_AMBIGUITY there would mislabel "not
  // applicable" as "unresolved conflict."
  if (caseState.eligibility.result === "undetermined" && procedure.eligibilityGrounds.length > 0) {
    deviations.push({
      type: "POLICY_SOURCE_AMBIGUITY",
      detail: `eligibility undetermined: ${caseState.eligibility.reason}`,
    });
  }

  return deviations;
}
