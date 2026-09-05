import test from "node:test";
import assert from "node:assert/strict";
import { validateRules } from "../src/validation/ruleValidator.ts";
import { buildProcedureModel } from "../src/procedure/procedureModel.ts";
import { computeCaseState } from "../src/case/caseTwin.ts";
import { detectDeviations } from "../src/deviation/detector.ts";
import { CaseEventLog } from "../src/case/eventLog.ts";
import { baseCandidate } from "./support/helpers.ts";

test("an institution deadline can expire while the student-side next-stage clock is still pending and relevant", () => {
  const institutionRule = baseCandidate({
    id: "inst-respond",
    actor: "committee",
    action: "respond_to_appeal",
    trigger: { eventType: "student_action_taken" },
    deadline: { type: "relative", amount: 30, unit: "calendar_day", fromEvent: "student_action_taken" },
  });
  const escalationRule = baseCandidate({
    id: "student-escalate",
    actor: "student",
    action: "file_escalation",
    trigger: { eventType: "institution_action_taken" },
    deadline: { type: "relative", amount: 10, unit: "calendar_day", fromEvent: "institution_action_taken" },
  });

  const { validated, errors } = validateRules([institutionRule, escalationRule]);
  assert.equal(errors.length, 0);

  const procedure = buildProcedureModel(validated);
  const log = new CaseEventLog([
    { eventId: "e1", type: "student_action_taken", occurredAt: "2026-01-01T00:00:00Z", detail: { obligationId: "irrelevant" } },
  ]);

  // now is 45 calendar days after the appeal was filed: institution's 30-day
  // clock has expired, but the escalation obligation's trigger
  // (institution_action_taken) has not happened yet, so it stays "unknown" —
  // not "missed", because its own clock hasn't started.
  const now = "2026-02-15T00:00:00Z";
  const state = computeCaseState(procedure, log, now);

  const institutionObligation = state.obligations.find((o) => o.obligationId === "inst-respond");
  const escalationObligation = state.obligations.find((o) => o.obligationId === "student-escalate");

  assert.equal(institutionObligation?.status, "missed");
  assert.equal(escalationObligation?.status, "unknown", "next-stage clock must not start until its own trigger fires");
  assert.equal(escalationObligation?.dueAt, null);

  const deviations = detectDeviations({
    procedure,
    caseState: state,
    log,
    conflicts: [],
    rejectedRuleErrors: [],
    sourceAmbiguities: [],
  });

  assert.ok(deviations.some((d) => d.type === "INSTITUTION_DEADLINE_EXCEEDED" && d.relatedObligationId === "inst-respond"));
  // the still-pending-but-not-yet-triggered escalation clock must not be
  // mis-reported as a deadline miss of its own.
  assert.ok(!deviations.some((d) => d.type === "STUDENT_DEADLINE_EXCEEDED" && d.relatedObligationId === "student-escalate"));
});
