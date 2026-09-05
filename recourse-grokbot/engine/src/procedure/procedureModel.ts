import type { ValidatedPolicyRule } from "../types/policy.ts";
import { BINDING_FORCES } from "../types/policy.ts";

/**
 * Procedure graph: a categorized, queryable view over a set of validated
 * rules for one compiled policy. This is not a generic graph library — it is
 * exactly the distinctions the case engine needs: which obligations bind
 * which party, which rules gate on evidence, which define escalation
 * transitions, and which define terminal states.
 */
export interface ProcedureModel {
  readonly studentObligations: ReadonlyArray<ValidatedPolicyRule>;
  readonly institutionObligations: ReadonlyArray<ValidatedPolicyRule>;
  readonly advisoryRules: ReadonlyArray<ValidatedPolicyRule>; // MAY/SHOULD/NORMALLY/ENCOURAGED — never gate state
  readonly evidenceGates: ReadonlyArray<ValidatedPolicyRule>;
  readonly eligibilityGrounds: ReadonlyArray<ValidatedPolicyRule>;
  readonly escalationPaths: ReadonlyArray<ValidatedPolicyRule>;
  readonly terminalStates: ReadonlyArray<ValidatedPolicyRule>;
}

function isStudentParty(actor: string): boolean {
  return actor.trim().toLowerCase() === "student";
}

export function buildProcedureModel(rules: ReadonlyArray<ValidatedPolicyRule>): ProcedureModel {
  const studentObligations: ValidatedPolicyRule[] = [];
  const institutionObligations: ValidatedPolicyRule[] = [];
  const advisoryRules: ValidatedPolicyRule[] = [];
  const evidenceGates: ValidatedPolicyRule[] = [];
  const eligibilityGrounds: ValidatedPolicyRule[] = [];
  const escalationPaths: ValidatedPolicyRule[] = [];
  const terminalStates: ValidatedPolicyRule[] = [];

  for (const rule of rules) {
    if (rule.kind === "evidence_requirement") {
      evidenceGates.push(rule);
      continue;
    }
    if (rule.kind === "eligibility_grounds") {
      eligibilityGrounds.push(rule);
      continue;
    }
    if (rule.kind === "escalation_path") {
      escalationPaths.push(rule);
      continue;
    }
    if (rule.kind === "terminal_state") {
      terminalStates.push(rule);
      continue;
    }
    if (rule.kind === "obligation") {
      if (!BINDING_FORCES.has(rule.deonticForce)) {
        advisoryRules.push(rule);
        continue;
      }
      if (isStudentParty(rule.actor)) {
        studentObligations.push(rule);
      } else {
        institutionObligations.push(rule);
      }
    }
  }

  return {
    studentObligations,
    institutionObligations,
    advisoryRules,
    evidenceGates,
    eligibilityGrounds,
    escalationPaths,
    terminalStates,
  };
}

export interface RuleConflict {
  readonly ruleIdA: string;
  readonly ruleIdB: string;
  readonly reason: string;
}

/**
 * Two rules are only flagged as conflicting when they govern the SAME scope:
 * same actor, same action, and the same trigger event type. Different
 * authority levels or different trigger scopes are not, by themselves,
 * conflicts — this is a deliberate correction of the earlier benchmark
 * failure mode where scope differences were over-detected as conflicts.
 * Within the same scope, a conflict is either an incompatible deontic force
 * pairing (MUST vs MUST_NOT, or MUST vs MAY on the same required action) or
 * two different deadlines asserted for the same obligation.
 */
export function detectConflicts(rules: ReadonlyArray<ValidatedPolicyRule>): RuleConflict[] {
  const conflicts: RuleConflict[] = [];
  const obligations = rules.filter((r) => r.kind === "obligation");

  for (const [i, a] of obligations.entries()) {
    for (const b of obligations.slice(i + 1)) {
      const sameScope =
        a.actor.trim().toLowerCase() === b.actor.trim().toLowerCase() &&
        a.action.trim().toLowerCase() === b.action.trim().toLowerCase() &&
        (a.trigger?.eventType ?? null) === (b.trigger?.eventType ?? null);

      if (!sameScope) continue;

      if (isIncompatibleForce(a.deonticForce, b.deonticForce)) {
        conflicts.push({
          ruleIdA: a.id,
          ruleIdB: b.id,
          reason: `incompatible deontic force for same actor/action/trigger: ${a.deonticForce} vs ${b.deonticForce}`,
        });
        continue;
      }

      if (a.deadline && b.deadline && deadlinesDiffer(a.deadline, b.deadline)) {
        conflicts.push({
          ruleIdA: a.id,
          ruleIdB: b.id,
          reason: "different deadlines asserted for the same obligation scope",
        });
      }
    }
  }

  return conflicts;
}

function isIncompatibleForce(a: string, b: string): boolean {
  const requiring = new Set(["MUST", "SHALL"]);
  const forbidding = new Set(["MUST_NOT", "SHALL_NOT"]);
  return (requiring.has(a) && forbidding.has(b)) || (requiring.has(b) && forbidding.has(a));
}

function deadlinesDiffer(a: NonNullable<ValidatedPolicyRule["deadline"]>, b: NonNullable<ValidatedPolicyRule["deadline"]>): boolean {
  return JSON.stringify(a) !== JSON.stringify(b);
}
