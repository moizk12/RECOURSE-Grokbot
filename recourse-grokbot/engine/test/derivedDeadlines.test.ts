import test from "node:test";
import assert from "node:assert/strict";
import { validateRule, validateRules } from "../src/validation/ruleValidator.ts";
import { buildProcedureModel } from "../src/procedure/procedureModel.ts";
import { computeCaseState } from "../src/case/caseTwin.ts";
import { CaseEventLog } from "../src/case/eventLog.ts";
import { FixedHolidayCalendar } from "../src/calendar/businessDayCalendar.ts";
import { baseCandidate } from "./support/helpers.ts";

function institutionRule() {
  return baseCandidate({
    id: "inst-decide",
    actor: "administrative_officer",
    action: "decide",
    trigger: { eventType: "grievance_filed" },
    deadline: { type: "relative", amount: 10, unit: "business_day", fromEvent: "grievance_filed" },
  });
}

function derivedStudentRule(overrides: Partial<ReturnType<typeof baseCandidate>> = {}) {
  return baseCandidate({
    id: "student-appeal",
    actor: "student",
    action: "appeal",
    trigger: { eventType: "grievance_filed" },
    deadline: {
      type: "derived",
      amount: 5,
      unit: "business_day",
      combinator: "earliest",
      anchors: [{ fromEvent: "institution_action_taken" }, { fromObligationDue: "inst-decide" }],
    },
    ...overrides,
  });
}

test("a derived deadline with a malformed anchor (both fromEvent and fromObligationDue) is rejected at validation", () => {
  const candidate = derivedStudentRule({
    deadline: {
      type: "derived",
      amount: 5,
      unit: "business_day",
      combinator: "earliest",
      anchors: [{ fromEvent: "x", fromObligationDue: "y" }],
    },
  });
  const result = validateRule(candidate);
  assert.equal(result.ok, false);
});

test("a derived deadline with zero anchors is rejected at validation", () => {
  const candidate = derivedStudentRule({
    deadline: { type: "derived", amount: 5, unit: "business_day", combinator: "earliest", anchors: [] },
  });
  const result = validateRule(candidate);
  assert.equal(result.ok, false);
});

test("derived deadline resolves via the obligation-due anchor when the event anchor never occurred", () => {
  const { validated, errors } = validateRules([institutionRule(), derivedStudentRule()]);
  assert.equal(errors.length, 0);
  const procedure = buildProcedureModel(validated);
  const calendar = new FixedHolidayCalendar([]);
  const log = new CaseEventLog([
    { eventId: "e1", type: "grievance_filed", occurredAt: "2026-01-05T00:00:00Z", detail: {} }, // Monday
  ]);

  // inst-decide due: +10 business days from Mon 2026-01-05 -> Mon 2026-01-19.
  // student-appeal derived: earliest of [unresolved event, 2026-01-19] -> 2026-01-19, +5 business days -> Mon 2026-01-26.
  const state = computeCaseState(procedure, log, "2026-01-10T00:00:00Z", calendar);
  const institutionObligation = state.obligations.find((o) => o.obligationId === "inst-decide");
  const studentObligation = state.obligations.find((o) => o.obligationId === "student-appeal");

  assert.equal(institutionObligation?.dueAt, "2026-01-19");
  assert.equal(studentObligation?.dueAt, "2026-01-26");
});

test("derived deadline prefers the earlier actual event over a later computed due date", () => {
  const { validated } = validateRules([institutionRule(), derivedStudentRule()]);
  const procedure = buildProcedureModel(validated);
  const log = new CaseEventLog([
    { eventId: "e1", type: "grievance_filed", occurredAt: "2026-01-05T00:00:00Z", detail: {} },
    // institution actually responds early, well before its 10-business-day due date.
    { eventId: "e2", type: "institution_action_taken", occurredAt: "2026-01-08T00:00:00Z", detail: {} },
  ]);
  const state = computeCaseState(procedure, log, "2026-01-10T00:00:00Z");
  const studentObligation = state.obligations.find((o) => o.obligationId === "student-appeal");

  // earliest of [2026-01-08, 2026-01-19] = 2026-01-08, +5 business days -> 2026-01-15.
  assert.equal(studentObligation?.dueAt, "2026-01-15");
});

test("a derived deadline whose only anchor obligation cannot itself be resolved stays unknown, not guessed", () => {
  const institution = baseCandidate({
    id: "inst-decide",
    actor: "administrative_officer",
    action: "decide",
    trigger: null, // ambiguous trigger blocks this obligation's own due date
    deadline: { type: "relative", amount: 10, unit: "business_day", fromEvent: "grievance_filed" },
  });
  const { validated } = validateRules([institution, derivedStudentRule()]);
  const procedure = buildProcedureModel(validated);
  const log = new CaseEventLog([{ eventId: "e1", type: "grievance_filed", occurredAt: "2026-01-05T00:00:00Z", detail: {} }]);
  const state = computeCaseState(procedure, log, "2026-01-10T00:00:00Z");

  const studentObligation = state.obligations.find((o) => o.obligationId === "student-appeal");
  assert.equal(studentObligation?.status, "unknown");
  assert.equal(studentObligation?.dueAt, null);
});

test("a circular obligation-due dependency fails closed into unknown rather than hanging or throwing", () => {
  const a = baseCandidate({
    id: "a",
    actor: "student",
    action: "a",
    trigger: { eventType: "grievance_filed" },
    deadline: { type: "derived", amount: 1, unit: "calendar_day", combinator: "earliest", anchors: [{ fromObligationDue: "b" }] },
  });
  const b = baseCandidate({
    id: "b",
    actor: "student",
    action: "b",
    trigger: { eventType: "grievance_filed" },
    deadline: { type: "derived", amount: 1, unit: "calendar_day", combinator: "earliest", anchors: [{ fromObligationDue: "a" }] },
  });
  const { validated, errors } = validateRules([a, b]);
  assert.equal(errors.length, 0);
  const procedure = buildProcedureModel(validated);
  const log = new CaseEventLog();

  const start = Date.now();
  const state = computeCaseState(procedure, log, "2026-01-10T00:00:00Z");
  assert.ok(Date.now() - start < 1000, "must not hang on a circular dependency");

  for (const obligation of state.obligations) {
    assert.equal(obligation.dueAt, null);
    assert.equal(obligation.status, "unknown");
  }
});
