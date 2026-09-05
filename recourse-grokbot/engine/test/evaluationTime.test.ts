import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFileSync } from "node:fs";
import { validateRules } from "../src/validation/ruleValidator.ts";
import { buildProcedureModel } from "../src/procedure/procedureModel.ts";
import { computeCaseState } from "../src/case/caseTwin.ts";
import { CaseEventLog } from "../src/case/eventLog.ts";
import { FixedHolidayCalendar } from "../src/calendar/businessDayCalendar.ts";
import type { CandidatePolicyRule } from "../src/types/policy.ts";
import type { CaseEvent } from "../src/types/case.ts";
import { evaluateFixtureFile } from "../src/cli/evaluate.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(__dirname, "..", "fixtures", "uic-case.json");

/**
 * computeCaseState/evaluateFixture must never depend on ambient system or
 * model time — evaluationAt is always an explicit, caller-supplied
 * parameter (see case/caseTwin.ts). These tests prove that by evaluating the
 * exact same UIC dual-clock rules/events against two different evaluationAt
 * instants and asserting the case state actually differs, and that the
 * output labels the timestamp it was computed against.
 */
function uicDualClockRules(): CandidatePolicyRule[] {
  return [
    {
      id: "ao_decision_deadline",
      policyId: "uic-grievance-procedures-2017",
      kind: "obligation",
      provenance: {
        sourceUrl: "https://dos.uic.edu/wp-content/uploads/sites/262/2019/12/UIC_Student_Academic_Grievance_Procedures-and-Forms_FINAL_Sept-2019.pdf",
        retrievedAt: "2026-09-05T09:56:25.964Z",
        sourceSpan: "Section IV.E: AO's decision must be issued within ten (10) business days of receipt.",
        actor: "administrative_officer",
      },
      actor: "administrative_officer",
      action: "decide_academic_grievance",
      trigger: { eventType: "grievance_filed" },
      conditions: [],
      deonticForce: "MUST",
      deadline: { type: "relative", amount: 10, unit: "business_day", fromEvent: "grievance_filed" },
    },
    {
      id: "student_appeal_to_go",
      policyId: "uic-grievance-procedures-2017",
      kind: "obligation",
      provenance: {
        sourceUrl: "https://dos.uic.edu/wp-content/uploads/sites/262/2019/12/UIC_Student_Academic_Grievance_Procedures-and-Forms_FINAL_Sept-2019.pdf",
        retrievedAt: "2026-09-05T09:56:25.964Z",
        sourceSpan: "Section V.B.2 / IV.A.4: appeal to GO due within five (5) business days of the earlier of receipt or due date.",
        actor: "student",
      },
      actor: "student",
      action: "appeal_ao_decision_to_grievance_officer",
      trigger: { eventType: "grievance_filed" },
      conditions: [],
      deonticForce: "MUST",
      deadline: {
        type: "derived",
        amount: 5,
        unit: "business_day",
        combinator: "earliest",
        anchors: [{ fromEvent: "institution_action_taken" }, { fromObligationDue: "ao_decision_deadline" }],
      },
    },
  ];
}

function uicEvents(): CaseEvent[] {
  return [
    { eventId: "e1", type: "case_opened", occurredAt: "2026-08-25T00:00:00Z", detail: {} },
    { eventId: "e2", type: "grievance_filed", occurredAt: "2026-09-01T00:00:00Z", detail: {} },
  ];
}

test("evaluationAt is echoed verbatim on CaseState (output is explicitly labeled, not implicit)", () => {
  const { validated, errors } = validateRules(uicDualClockRules());
  assert.equal(errors.length, 0);
  const procedure = buildProcedureModel(validated);
  const log = new CaseEventLog(uicEvents());
  const calendar = new FixedHolidayCalendar(["2026-09-07"]);

  const state = computeCaseState(procedure, log, "2026-09-05T00:00:00Z", calendar);
  assert.equal(state.evaluationAt, "2026-09-05T00:00:00Z");
});

test("the real UIC dual-clock case evaluated on 2026-09-05 (both deadlines still open) vs 2026-10-15 (both deadlines expired) produces different Case Twin states from identical rules and events", () => {
  const { validated, errors } = validateRules(uicDualClockRules());
  assert.equal(errors.length, 0);
  const procedure = buildProcedureModel(validated);
  const log = new CaseEventLog(uicEvents());
  const calendar = new FixedHolidayCalendar(["2026-09-07"]);

  // AO decision due 2026-09-16 (10 business days after 2026-09-01, skipping
  // the weekend and the 2026-09-07 holiday). Student appeal derived deadline
  // due 2026-09-23 (5 business days after the AO's due date, since the
  // institution never acted).
  const earlyState = computeCaseState(procedure, log, "2026-09-05T00:00:00Z", calendar);
  const lateState = computeCaseState(procedure, log, "2026-10-15T00:00:00Z", calendar);

  const earlyInstitution = earlyState.obligations.find((o) => o.obligationId === "ao_decision_deadline");
  const earlyStudent = earlyState.obligations.find((o) => o.obligationId === "student_appeal_to_go");
  const lateInstitution = lateState.obligations.find((o) => o.obligationId === "ao_decision_deadline");
  const lateStudent = lateState.obligations.find((o) => o.obligationId === "student_appeal_to_go");

  // Same due dates in both evaluations — evaluationAt only affects status,
  // never the deadline computation itself.
  assert.equal(earlyInstitution?.dueAt, "2026-09-16");
  assert.equal(lateInstitution?.dueAt, "2026-09-16");
  assert.equal(earlyStudent?.dueAt, "2026-09-23");
  assert.equal(lateStudent?.dueAt, "2026-09-23");

  // 2026-09-05 is before both due dates: both obligations are still pending.
  assert.equal(earlyInstitution?.status, "pending");
  assert.equal(earlyStudent?.status, "pending");

  // 2026-10-15 is after both due dates: both obligations are missed.
  assert.equal(lateInstitution?.status, "missed");
  assert.equal(lateStudent?.status, "missed");

  assert.notEqual(earlyInstitution?.status, lateInstitution?.status);
  assert.notEqual(earlyStudent?.status, lateStudent?.status);

  assert.equal(earlyState.evaluationAt, "2026-09-05T00:00:00Z");
  assert.equal(lateState.evaluationAt, "2026-10-15T00:00:00Z");
});

test("evaluateFixtureFile reads evaluationAt from the fixture file explicitly (fixtures/uic-case.json fixes it at 2026-10-15, matching the fixture's documented scenario)", () => {
  const raw = JSON.parse(readFileSync(fixturePath, "utf-8")) as { evaluationAt: string };
  assert.equal(raw.evaluationAt, "2026-10-15T00:00:00Z");

  const result = evaluateFixtureFile(fixturePath);
  assert.equal(result.caseState.evaluationAt, "2026-10-15T00:00:00Z");
});
