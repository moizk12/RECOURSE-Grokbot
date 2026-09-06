import type { CaseEvent, CaseState, Deviation, ObligationStatus } from "../types/case.ts";
import type { ConformanceResult, ConformanceStatus, ValidatedConformanceRule } from "../types/conformance.ts";
import type { ProcedureModel, RuleConflict } from "../procedure/procedureModel.ts";
import type { HolidayCalendar } from "../calendar/businessDayCalendar.ts";
import type { ValidationError } from "../validation/errors.ts";
import { CaseEventLog } from "../case/eventLog.ts";
import { computeCaseState } from "../case/caseTwin.ts";
import { checkAllConformance } from "../conformance/conformanceChecker.ts";
import { detectDeviations } from "../deviation/detector.ts";

/**
 * Deterministic procedural forecasting.
 *
 * This does NOT predict what an institution will choose to do. It answers a
 * strictly narrower question: what does the ALREADY-VALIDATED procedure imply
 * at a stated future evaluation instant, under a stated event scenario?
 *
 * Two scenario kinds, and no third:
 *
 *   NO_NEW_EVENTS      re-evaluate the same immutable case trace at a later
 *                      explicit evaluationAt. Nothing is added. This is what
 *                      answers "if nobody does anything, what is true on the
 *                      30th?"
 *   EXPLICIT_SCENARIO  additionally evaluate with hypothetical future
 *                      CaseEvents SUPPLIED BY THE CALLER. The engine never
 *                      invents a hypothetical event, and there is no code
 *                      path here that constructs a CaseEvent -- every event
 *                      in a simulated trace came either from the real log or
 *                      from `scenario.hypotheticalEvents` verbatim.
 *
 * There is deliberately no second deadline engine: forecasting calls exactly
 * the same computeCaseState / addDays / checkAllConformance / detectDeviations
 * the present-tense analysis calls, differing only in the evaluation instant
 * and the (temporary, discarded) simulated trace.
 *
 * The real CaseEventLog is never mutated. Simulation always builds a fresh
 * CaseEventLog from a copy; see forecast tests for the purity assertions.
 */
export type ForecastScenarioKind = "NO_NEW_EVENTS" | "EXPLICIT_SCENARIO";

export interface ForecastScenario {
  readonly id: string;
  readonly kind: ForecastScenarioKind;
  /** Explicit future (or any) evaluation instant. Never defaulted to wall-clock time. */
  readonly evaluationAt: string;
  /** Caller-supplied hypothetical events. Only permitted on EXPLICIT_SCENARIO. */
  readonly hypotheticalEvents?: ReadonlyArray<CaseEvent>;
  /** Free-text assumptions recorded verbatim in the result and in any Recourse Trace. */
  readonly assumptions?: ReadonlyArray<string>;
}

export interface ForecastInputs {
  readonly procedure: ProcedureModel;
  /** The real, append-only case trace. Read only. */
  readonly log: CaseEventLog;
  readonly conformanceRules: ReadonlyArray<ValidatedConformanceRule>;
  readonly calendar: HolidayCalendar;
  /** The instant the present-tense analysis was evaluated at -- the baseline every scenario is compared against. */
  readonly baselineEvaluationAt: string;
  readonly conflicts?: ReadonlyArray<RuleConflict>;
  readonly rejectedRuleErrors?: ReadonlyArray<ValidationError>;
  readonly sourceAmbiguities?: ReadonlyArray<string>;
}

export type ForecastChange =
  | { readonly kind: "obligation_status"; readonly obligationId: string; readonly from: ObligationStatus; readonly to: ObligationStatus }
  | { readonly kind: "obligation_due"; readonly obligationId: string; readonly from: string | null; readonly to: string | null }
  | { readonly kind: "eligibility"; readonly from: string; readonly to: string }
  | { readonly kind: "conformance_status"; readonly ruleId: string; readonly from: ConformanceStatus; readonly to: ConformanceStatus };

/**
 * What the forecast actually established, in the caller's terms.
 *
 * STATE_UNCHANGED                nothing the procedure governs moves.
 * DEADLINE_OR_STATE_TRANSITION   a due date resolves, an obligation changes
 *                                status, eligibility changes, or a
 *                                conformance finding resolves -- without a
 *                                new violation appearing.
 * NEW_DEVIATION_DETECTED         a deadline is missed, or a conformance rule
 *                                becomes NONCONFORMANT, that was not so at
 *                                baseline.
 * CONDITIONAL_ON_FUTURE_EVENT    nothing moves, and something cannot move
 *                                until an event that has not happened does.
 * CANNOT_DETERMINE               there is nothing validated to evaluate --
 *                                no obligations and no conformance rules
 *                                survived the authority/warrant layers.
 */
export type ForecastOutcome =
  | "STATE_UNCHANGED"
  | "DEADLINE_OR_STATE_TRANSITION"
  | "NEW_DEVIATION_DETECTED"
  | "CONDITIONAL_ON_FUTURE_EVENT"
  | "CANNOT_DETERMINE";

export interface ForecastError {
  readonly scenarioId: string;
  readonly field: string;
  readonly message: string;
}

export type ForecastPoint =
  | {
      readonly status: "evaluated";
      readonly scenarioId: string;
      readonly kind: ForecastScenarioKind;
      readonly evaluationAt: string;
      readonly assumptions: ReadonlyArray<string>;
      /** Ids of the caller-supplied hypothetical events actually applied. Empty for NO_NEW_EVENTS. */
      readonly hypotheticalEventIds: ReadonlyArray<string>;
      readonly outcome: ForecastOutcome;
      readonly changes: ReadonlyArray<ForecastChange>;
      readonly caseState: CaseState;
      readonly conformance: ReadonlyArray<ConformanceResult>;
      readonly deviations: ReadonlyArray<Deviation>;
    }
  | { readonly status: "rejected"; readonly scenarioId: string; readonly errors: ReadonlyArray<ForecastError> };

function ferr(scenarioId: string, field: string, message: string): ForecastError {
  return { scenarioId, field, message };
}

/**
 * Scenario validation. A scenario is untrusted input like any other model
 * output, so it is checked before it can influence an evaluation: a
 * NO_NEW_EVENTS scenario carrying hypothetical events is a contradiction and
 * is refused rather than silently reinterpreted, and a hypothetical event
 * that reuses a real event's id is refused rather than shadowing history.
 */
function validateScenario(scenario: ForecastScenario, realEventIds: ReadonlySet<string>): ForecastError[] {
  const errors: ForecastError[] = [];
  const id = scenario.id;

  if (!id || id.trim().length === 0) {
    errors.push(ferr(String(id), "id", "scenario id is required"));
  }
  if (!scenario.evaluationAt || scenario.evaluationAt.trim().length === 0) {
    errors.push(ferr(id, "evaluationAt", "an explicit evaluationAt is required; forecasting never substitutes wall-clock time"));
  }
  if (scenario.kind !== "NO_NEW_EVENTS" && scenario.kind !== "EXPLICIT_SCENARIO") {
    errors.push(ferr(id, "kind", `unrecognized scenario kind: ${String(scenario.kind)}`));
    return errors;
  }

  const hypothetical = scenario.hypotheticalEvents ?? [];

  if (scenario.kind === "NO_NEW_EVENTS" && hypothetical.length > 0) {
    errors.push(
      ferr(
        id,
        "hypotheticalEvents",
        "a NO_NEW_EVENTS scenario must not carry hypothetical events -- use kind EXPLICIT_SCENARIO to state them"
      )
    );
  }

  const seen = new Set<string>();
  for (const event of hypothetical) {
    if (!event.eventId || !event.type || !event.occurredAt) {
      errors.push(ferr(id, "hypotheticalEvents", "each hypothetical event requires eventId, type, and occurredAt"));
      continue;
    }
    if (realEventIds.has(event.eventId)) {
      errors.push(
        ferr(
          id,
          "hypotheticalEvents",
          `hypothetical event '${event.eventId}' reuses the id of an event already in the real trace -- a simulation may add to history, never overwrite it`
        )
      );
    }
    if (seen.has(event.eventId)) {
      errors.push(ferr(id, "hypotheticalEvents", `duplicate hypothetical event id '${event.eventId}'`));
    }
    seen.add(event.eventId);
  }

  return errors;
}

function diff(
  baselineState: CaseState,
  baselineConformance: ReadonlyArray<ConformanceResult>,
  forecastState: CaseState,
  forecastConformance: ReadonlyArray<ConformanceResult>
): ForecastChange[] {
  const changes: ForecastChange[] = [];

  const baselineObligations = new Map(baselineState.obligations.map((o) => [o.obligationId, o]));
  for (const after of forecastState.obligations) {
    const before = baselineObligations.get(after.obligationId);
    if (!before) continue;
    if (before.status !== after.status) {
      changes.push({
        kind: "obligation_status",
        obligationId: after.obligationId,
        from: before.status,
        to: after.status,
      });
    }
    if (before.dueAt !== after.dueAt) {
      changes.push({ kind: "obligation_due", obligationId: after.obligationId, from: before.dueAt, to: after.dueAt });
    }
  }

  if (baselineState.eligibility.result !== forecastState.eligibility.result) {
    changes.push({
      kind: "eligibility",
      from: baselineState.eligibility.result,
      to: forecastState.eligibility.result,
    });
  }

  const baselineFindings = new Map(baselineConformance.map((c) => [c.ruleId, c]));
  for (const after of forecastConformance) {
    const before = baselineFindings.get(after.ruleId);
    if (!before || before.status === after.status) continue;
    changes.push({ kind: "conformance_status", ruleId: after.ruleId, from: before.status, to: after.status });
  }

  return changes;
}

function classify(
  changes: ReadonlyArray<ForecastChange>,
  forecastState: CaseState,
  forecastConformance: ReadonlyArray<ConformanceResult>
): ForecastOutcome {
  if (forecastState.obligations.length === 0 && forecastConformance.length === 0) {
    return "CANNOT_DETERMINE";
  }

  const newViolation = changes.some(
    (c) =>
      (c.kind === "obligation_status" && c.to === "missed") ||
      (c.kind === "conformance_status" && c.to === "NONCONFORMANT")
  );
  if (newViolation) return "NEW_DEVIATION_DETECTED";

  if (changes.length > 0) return "DEADLINE_OR_STATE_TRANSITION";

  const waitingOnSomething =
    forecastState.obligations.some((o) => o.status === "unknown") ||
    forecastConformance.some((c) => c.status === "UNDETERMINED");
  if (waitingOnSomething) return "CONDITIONAL_ON_FUTURE_EVENT";

  return "STATE_UNCHANGED";
}

/**
 * Evaluates one scenario against a temporary simulation trace and reports
 * what changed relative to the baseline evaluation. The baseline is itself
 * computed here, from the same inputs at `baselineEvaluationAt`, so a
 * forecast's "what changed" can never be measured against a stale or
 * separately-derived snapshot.
 */
export function forecastScenario(inputs: ForecastInputs, scenario: ForecastScenario): ForecastPoint {
  const realEvents = inputs.log.all();
  const errors = validateScenario(scenario, new Set(realEvents.map((e) => e.eventId)));
  if (errors.length > 0) {
    return { status: "rejected", scenarioId: scenario.id, errors };
  }

  const deviationContext = {
    procedure: inputs.procedure,
    conflicts: inputs.conflicts ?? [],
    rejectedRuleErrors: inputs.rejectedRuleErrors ?? [],
    sourceAmbiguities: inputs.sourceAmbiguities ?? [],
  };

  // Baseline: the real trace, at the real evaluation instant.
  const baselineLog = new CaseEventLog(realEvents);
  const baselineState = computeCaseState(inputs.procedure, baselineLog, inputs.baselineEvaluationAt, inputs.calendar);
  const baselineConformance = checkAllConformance(inputs.conformanceRules, baselineLog, inputs.calendar);

  // Simulation: a fresh log built from a copy of the real trace plus, only
  // for EXPLICIT_SCENARIO, the caller's stated hypothetical events.
  const hypothetical = scenario.kind === "EXPLICIT_SCENARIO" ? (scenario.hypotheticalEvents ?? []) : [];
  const simulatedLog = new CaseEventLog([...realEvents, ...hypothetical]);

  const forecastState = computeCaseState(inputs.procedure, simulatedLog, scenario.evaluationAt, inputs.calendar);
  const forecastConformance = checkAllConformance(inputs.conformanceRules, simulatedLog, inputs.calendar);
  const deviations = detectDeviations({ ...deviationContext, caseState: forecastState, log: simulatedLog });

  const changes = diff(baselineState, baselineConformance, forecastState, forecastConformance);

  return {
    status: "evaluated",
    scenarioId: scenario.id,
    kind: scenario.kind,
    evaluationAt: scenario.evaluationAt,
    assumptions: [...(scenario.assumptions ?? [])],
    hypotheticalEventIds: hypothetical.map((e) => e.eventId),
    outcome: classify(changes, forecastState, forecastConformance),
    changes,
    caseState: forecastState,
    conformance: forecastConformance,
    deviations,
  };
}

/** Batch form of forecastScenario. Never throws; one ForecastPoint per scenario, in order. */
export function forecastScenarios(
  inputs: ForecastInputs,
  scenarios: ReadonlyArray<ForecastScenario>
): ForecastPoint[] {
  return scenarios.map((scenario) => forecastScenario(inputs, scenario));
}
