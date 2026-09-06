import test from "node:test";
import assert from "node:assert/strict";
import { forecastScenario, forecastScenarios, type ForecastInputs } from "../src/forecast/forecast.ts";
import { buildProcedureModel } from "../src/procedure/procedureModel.ts";
import { CaseEventLog } from "../src/case/eventLog.ts";
import { computeCaseState } from "../src/case/caseTwin.ts";
import { FixedHolidayCalendar, NO_HOLIDAYS } from "../src/calendar/businessDayCalendar.ts";
import type { ValidatedPolicyRule } from "../src/types/policy.ts";
import type { ValidatedConformanceRule } from "../src/types/conformance.ts";
import type { CaseEvent } from "../src/types/case.ts";

/**
 * Forecast tests.
 *
 * Every rule here is constructed as an already-ValidatedPolicyRule /
 * ValidatedConformanceRule on purpose: forecasting operates strictly
 * downstream of the authority and warrant layers, so these tests are about
 * time semantics, purity, and uncertainty -- not about how a rule became
 * executable, which is covered by analyzeCase.test.ts and the warrant tests.
 */

function validatedRule(overrides: Partial<ValidatedPolicyRule> & { id: string }): ValidatedPolicyRule {
  return Object.freeze({
    policyId: "uic-grievance",
    kind: "obligation",
    provenance: {
      sourceUrl: "https://example.edu/policy",
      retrievedAt: "2026-01-01T00:00:00Z",
      sourceSpan: "quoted span",
      actor: "student",
    },
    actor: "student",
    action: "act",
    trigger: { eventType: "grievance_filed" },
    conditions: [],
    deonticForce: "MUST" as const,
    ...overrides,
  }) as ValidatedPolicyRule;
}

/**
 * The UIC-shaped two-clock model, in the abstract:
 *
 *   institution-respond   the institution must respond within 15 calendar
 *                         days of the grievance being filed.
 *   student-appeal        the student's appeal window runs from the date the
 *                         decision is RECEIVED **or IS DUE, whichever is
 *                         earlier** -- a derived deadline anchored partly on
 *                         another obligation's own due date, which is what
 *                         keeps the student's clock running while the
 *                         institution is silent.
 */
const INSTITUTION_RESPOND = validatedRule({
  id: "institution-respond",
  actor: "institution",
  action: "issue_decision",
  trigger: { eventType: "grievance_filed" },
  deadline: { type: "relative", amount: 15, unit: "calendar_day", fromEvent: "grievance_filed" },
});

const STUDENT_APPEAL = validatedRule({
  id: "student-appeal",
  actor: "student",
  action: "file_appeal",
  trigger: { eventType: "grievance_filed" },
  deadline: {
    type: "derived",
    amount: 10,
    unit: "calendar_day",
    combinator: "earliest",
    anchors: [{ fromEvent: "decision_notice_received" }, { fromObligationDue: "institution-respond" }],
  },
});

const NOTICE_LEAD_TIME: ValidatedConformanceRule = Object.freeze({
  id: "hearing-notice-lead-time",
  sourceId: "campus",
  actor: "institution",
  constraint: {
    kind: "minimum_lead_time" as const,
    anchorEventType: "hearing_notice_sent",
    targetEventType: "hearing_held",
    minimum: { amount: 5, unit: "business_day" as const },
  },
  warrant: {
    sourceId: "campus",
    contentHash: "sha256:test",
    span: { start: 0, end: 10 },
    quotedText: "quoted",
    claimType: "directly_stated" as const,
  },
});

/** Grievance filed 2026-03-02. Nothing else has happened. */
const FILED_ONLY: CaseEvent[] = [
  { eventId: "e1", type: "case_opened", occurredAt: "2026-03-02T09:00:00Z", detail: {} },
  { eventId: "e2", type: "grievance_filed", occurredAt: "2026-03-02T09:00:00Z", detail: {} },
];

function inputs(overrides: Partial<ForecastInputs> = {}): ForecastInputs {
  return {
    procedure: buildProcedureModel([INSTITUTION_RESPOND, STUDENT_APPEAL]),
    log: new CaseEventLog(FILED_ONLY),
    conformanceRules: [],
    calendar: NO_HOLIDAYS,
    baselineEvaluationAt: "2026-03-10T00:00:00Z",
    ...overrides,
  };
}

test("NO_NEW_EVENTS: the institution's own deadline passing is a newly detectable deviation", () => {
  const point = forecastScenario(inputs(), {
    id: "s1",
    kind: "NO_NEW_EVENTS",
    evaluationAt: "2026-03-20T00:00:00Z",
    assumptions: ["no party takes any further action"],
  });

  assert.equal(point.status, "evaluated");
  if (point.status !== "evaluated") return;

  // Institution response was due 2026-03-17 (2026-03-02 + 15 calendar days).
  assert.equal(point.outcome, "NEW_DEVIATION_DETECTED");
  const institution = point.caseState.obligations.find((o) => o.obligationId === "institution-respond");
  assert.equal(institution?.dueAt, "2026-03-17");
  assert.equal(institution?.status, "missed");
  assert.ok(
    point.changes.some((c) => c.kind === "obligation_status" && c.obligationId === "institution-respond" && c.to === "missed")
  );
  assert.ok(point.deviations.some((d) => d.type === "INSTITUTION_DEADLINE_EXCEEDED"));
});

test("NO_NEW_EVENTS: institutional silence does not freeze the student's derived next-stage clock", () => {
  // The student's appeal deadline is derived from the EARLIER of (decision
  // received) and (decision due). No decision has been received at all, yet
  // the clock still resolves -- from the institution's own due date.
  const points = forecastScenarios(inputs(), [
    { id: "d+8", kind: "NO_NEW_EVENTS", evaluationAt: "2026-03-10T00:00:00Z" },
    { id: "d+18", kind: "NO_NEW_EVENTS", evaluationAt: "2026-03-20T00:00:00Z" },
    { id: "d+30", kind: "NO_NEW_EVENTS", evaluationAt: "2026-04-01T00:00:00Z" },
  ]);

  const appealDue = (i: number) => {
    const p = points[i]!;
    assert.equal(p.status, "evaluated");
    if (p.status !== "evaluated") throw new Error("unreachable");
    return p.caseState.obligations.find((o) => o.obligationId === "student-appeal");
  };

  // 2026-03-17 (institution's due date) + 10 calendar days = 2026-03-27,
  // at every evaluation instant -- the due date is a property of the
  // procedure and the trace, not of when you happen to ask.
  assert.equal(appealDue(0)?.dueAt, "2026-03-27");
  assert.equal(appealDue(1)?.dueAt, "2026-03-27");
  assert.equal(appealDue(2)?.dueAt, "2026-03-27");

  // Only the status moves as the stated evaluation instant moves.
  assert.equal(appealDue(0)?.status, "pending");
  assert.equal(appealDue(1)?.status, "pending");
  assert.equal(appealDue(2)?.status, "missed");
});

test("multiple future dates are evaluated independently from the same immutable trace", () => {
  const shared = inputs();
  const points = forecastScenarios(shared, [
    { id: "a", kind: "NO_NEW_EVENTS", evaluationAt: "2026-03-16T00:00:00Z" },
    { id: "b", kind: "NO_NEW_EVENTS", evaluationAt: "2026-03-18T00:00:00Z" },
  ]);

  const [a, b] = points;
  assert.equal(a?.status, "evaluated");
  assert.equal(b?.status, "evaluated");
  if (a?.status !== "evaluated" || b?.status !== "evaluated") return;

  assert.equal(a.caseState.obligations.find((o) => o.obligationId === "institution-respond")?.status, "pending");
  assert.equal(b.caseState.obligations.find((o) => o.obligationId === "institution-respond")?.status, "missed");
  assert.equal(a.outcome, "STATE_UNCHANGED");
  assert.equal(b.outcome, "NEW_DEVIATION_DETECTED");
});

test("EXPLICIT_SCENARIO: a caller-supplied hypothetical event moves the state, and only the caller can supply it", () => {
  const point = forecastScenario(inputs(), {
    id: "s-respond",
    kind: "EXPLICIT_SCENARIO",
    evaluationAt: "2026-03-20T00:00:00Z",
    assumptions: ["assumes the institution issues its decision on 2026-03-16"],
    hypotheticalEvents: [
      {
        eventId: "h1",
        type: "institution_action_taken",
        occurredAt: "2026-03-16T09:00:00Z",
        detail: { obligationId: "institution-respond" },
      },
    ],
  });

  assert.equal(point.status, "evaluated");
  if (point.status !== "evaluated") return;

  assert.deepEqual([...point.hypotheticalEventIds], ["h1"]);
  assert.equal(point.caseState.obligations.find((o) => o.obligationId === "institution-respond")?.status, "met");
  // The institution met its deadline in this scenario, so no new violation --
  // just a state transition relative to the baseline's "pending".
  assert.equal(point.outcome, "DEADLINE_OR_STATE_TRANSITION");
  assert.deepEqual(
    [...point.assumptions],
    ["assumes the institution issues its decision on 2026-03-16"]
  );
});

test("purity: forecasting never mutates the real event log, and the real state recomputes identically afterwards", () => {
  const log = new CaseEventLog(FILED_ONLY);
  const procedure = buildProcedureModel([INSTITUTION_RESPOND, STUDENT_APPEAL]);
  const before = computeCaseState(procedure, log, "2026-03-10T00:00:00Z", NO_HOLIDAYS);
  const eventCountBefore = log.all().length;

  forecastScenarios({ procedure, log, conformanceRules: [], calendar: NO_HOLIDAYS, baselineEvaluationAt: "2026-03-10T00:00:00Z" }, [
    { id: "f1", kind: "NO_NEW_EVENTS", evaluationAt: "2026-06-01T00:00:00Z" },
    {
      id: "f2",
      kind: "EXPLICIT_SCENARIO",
      evaluationAt: "2026-06-01T00:00:00Z",
      hypotheticalEvents: [
        { eventId: "h9", type: "institution_action_taken", occurredAt: "2026-03-05T09:00:00Z", detail: { obligationId: "institution-respond" } },
      ],
    },
  ]);

  assert.equal(log.all().length, eventCountBefore);
  assert.ok(!log.all().some((e) => e.eventId === "h9"));
  const after = computeCaseState(procedure, log, "2026-03-10T00:00:00Z", NO_HOLIDAYS);
  assert.deepEqual(after, before);
});

test("a NO_NEW_EVENTS scenario carrying hypothetical events is refused, not silently reinterpreted", () => {
  const point = forecastScenario(inputs(), {
    id: "bad",
    kind: "NO_NEW_EVENTS",
    evaluationAt: "2026-04-01T00:00:00Z",
    hypotheticalEvents: [
      { eventId: "h1", type: "institution_action_taken", occurredAt: "2026-03-16T09:00:00Z", detail: {} },
    ],
  });

  assert.equal(point.status, "rejected");
  if (point.status !== "rejected") return;
  assert.match(point.errors.map((e) => e.message).join(" "), /must not carry hypothetical events/);
});

test("a hypothetical event may not reuse a real event's id -- a simulation adds to history, never overwrites it", () => {
  const point = forecastScenario(inputs(), {
    id: "collide",
    kind: "EXPLICIT_SCENARIO",
    evaluationAt: "2026-04-01T00:00:00Z",
    hypotheticalEvents: [{ eventId: "e2", type: "grievance_filed", occurredAt: "2026-01-01T09:00:00Z", detail: {} }],
  });

  assert.equal(point.status, "rejected");
  if (point.status !== "rejected") return;
  assert.match(point.errors.map((e) => e.message).join(" "), /reuses the id of an event already in the real trace/);
});

test("a scenario without an explicit evaluationAt is refused; forecasting never substitutes wall-clock time", () => {
  const point = forecastScenario(inputs(), {
    id: "no-date",
    kind: "NO_NEW_EVENTS",
    evaluationAt: "",
  });

  assert.equal(point.status, "rejected");
  if (point.status !== "rejected") return;
  assert.match(point.errors.map((e) => e.message).join(" "), /explicit evaluationAt is required/);
});

test("uncertainty: a condition that depends on a future event is reported as such, not as 'nothing happens'", () => {
  // A rule whose trigger event has not occurred: its deadline cannot be
  // computed at ANY evaluation instant until the event is recorded.
  const waiting = validatedRule({
    id: "student-provide-evidence",
    actor: "student",
    action: "provide_evidence",
    trigger: { eventType: "hearing_scheduled" },
    deadline: { type: "relative", amount: 5, unit: "business_day", fromEvent: "hearing_scheduled" },
  });

  const point = forecastScenario(
    inputs({ procedure: buildProcedureModel([waiting]), baselineEvaluationAt: "2026-03-10T00:00:00Z" }),
    { id: "u1", kind: "NO_NEW_EVENTS", evaluationAt: "2027-01-01T00:00:00Z" }
  );

  assert.equal(point.status, "evaluated");
  if (point.status !== "evaluated") return;
  assert.equal(point.outcome, "CONDITIONAL_ON_FUTURE_EVENT");
  assert.deepEqual([...point.changes], []);
  const obligation = point.caseState.obligations[0];
  assert.equal(obligation?.status, "unknown");
  assert.match(obligation?.reason ?? "", /has not occurred yet/);
});

test("CANNOT_DETERMINE when nothing survived validation to forecast against", () => {
  const point = forecastScenario(inputs({ procedure: buildProcedureModel([]), conformanceRules: [] }), {
    id: "empty",
    kind: "NO_NEW_EVENTS",
    evaluationAt: "2026-12-01T00:00:00Z",
  });

  assert.equal(point.status, "evaluated");
  if (point.status !== "evaluated") return;
  assert.equal(point.outcome, "CANNOT_DETERMINE");
});

test("forecast conformance reuses the same checker and business-day calendar as present-tense analysis", () => {
  const trace: CaseEvent[] = [
    { eventId: "n1", type: "hearing_notice_sent", occurredAt: "2026-03-20T09:00:00Z", detail: {} },
  ];

  const shared: ForecastInputs = {
    procedure: buildProcedureModel([]),
    log: new CaseEventLog(trace),
    conformanceRules: [NOTICE_LEAD_TIME],
    // 2026-03-25 declared an institution closure, so the 5 business days from
    // Friday 2026-03-20 land on 2026-03-30, not 2026-03-27.
    calendar: new FixedHolidayCalendar(["2026-03-25"]),
    baselineEvaluationAt: "2026-03-20T00:00:00Z",
  };

  const point = forecastScenario(shared, {
    id: "hearing-too-soon",
    kind: "EXPLICIT_SCENARIO",
    evaluationAt: "2026-03-30T00:00:00Z",
    assumptions: ["assumes the hearing is held on 2026-03-27 as currently scheduled"],
    hypotheticalEvents: [{ eventId: "h-hearing", type: "hearing_held", occurredAt: "2026-03-27T09:00:00Z", detail: {} }],
  });

  assert.equal(point.status, "evaluated");
  if (point.status !== "evaluated") return;

  assert.equal(point.conformance[0]?.status, "NONCONFORMANT");
  assert.match(point.conformance[0]?.reason ?? "", /2026-03-30/);
  assert.equal(point.outcome, "NEW_DEVIATION_DETECTED");
  assert.ok(
    point.changes.some(
      (c) => c.kind === "conformance_status" && c.from === "UNDETERMINED" && c.to === "NONCONFORMANT"
    )
  );
});
