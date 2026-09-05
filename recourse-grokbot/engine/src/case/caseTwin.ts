import type { DeadlineAnchor, ValidatedPolicyRule } from "../types/policy.ts";
import type { CaseState, EligibilityDetermination, ObligationState } from "../types/case.ts";
import type { ProcedureModel } from "../procedure/procedureModel.ts";
import type { CaseEventLog } from "./eventLog.ts";
import type { HolidayCalendar } from "../calendar/businessDayCalendar.ts";
import { addDays, NO_HOLIDAYS } from "../calendar/businessDayCalendar.ts";

/**
 * The Case Twin: policy (ProcedureModel) describes what should happen; the
 * event log describes what has actually happened. This function is the only
 * place case state is computed, and it always recomputes from scratch —
 * there is no incremental "apply this one event to the existing state" path,
 * which is what makes re-verification and drift detection safe to run
 * repeatedly.
 *
 * `evaluationAt` is the point in time the case is evaluated as of. It is a
 * required, explicit parameter — there is no default and nothing in this
 * module ever calls Date.now()/new Date() to substitute one. Deadline logic
 * (missed/pending/met) is a pure function of (rules, events, evaluationAt),
 * never of ambient system or model time.
 */
export function computeCaseState(
  procedure: ProcedureModel,
  log: CaseEventLog,
  evaluationAt: string,
  calendar: HolidayCalendar = NO_HOLIDAYS
): CaseState {
  const allObligations = new Map<string, ValidatedPolicyRule>();
  for (const r of procedure.studentObligations) allObligations.set(r.id, r);
  for (const r of procedure.institutionObligations) allObligations.set(r.id, r);

  // Per-evaluation memo: due dates are pure functions of (rules, events, calendar),
  // so caching within one computeCaseState call is safe and avoids recomputing a
  // due date that multiple derived deadlines depend on.
  const dueDateCache = new Map<string, DueDateResult>();

  const studentObligations = procedure.studentObligations.map((r) =>
    computeObligationState(r, "student", log, evaluationAt, calendar, allObligations, dueDateCache)
  );
  const institutionObligations = procedure.institutionObligations.map((r) =>
    computeObligationState(r, "institution", log, evaluationAt, calendar, allObligations, dueDateCache)
  );

  const eligibility = determineEligibility(procedure, log);

  return {
    evaluationAt,
    obligations: [...studentObligations, ...institutionObligations],
    eligibility,
  };
}

interface DueDateResult {
  readonly dueAt: string | null;
  readonly reason: string;
}

/**
 * Resolves the due date implied by a rule's `deadline` (not the full
 * obligation status — completion/miss is layered on top by
 * computeObligationState). Handles "derived" deadlines by recursively
 * resolving the obligations referenced via `fromObligationDue`, with cycle
 * detection: a circular dependency fails closed into "unknown", never an
 * infinite loop or a guessed date.
 */
function resolveDueDate(
  rule: ValidatedPolicyRule,
  log: CaseEventLog,
  calendar: HolidayCalendar,
  allObligations: ReadonlyMap<string, ValidatedPolicyRule>,
  cache: Map<string, DueDateResult>,
  visiting: ReadonlySet<string>
): DueDateResult {
  const cached = cache.get(rule.id);
  if (cached) return cached;

  if (visiting.has(rule.id)) {
    const result: DueDateResult = {
      dueAt: null,
      reason: `circular deadline dependency detected involving obligation "${rule.id}"`,
    };
    cache.set(rule.id, result);
    return result;
  }

  const result = computeDueDateUncached(rule, log, calendar, allObligations, cache, new Set([...visiting, rule.id]));
  cache.set(rule.id, result);
  return result;
}

function computeDueDateUncached(
  rule: ValidatedPolicyRule,
  log: CaseEventLog,
  calendar: HolidayCalendar,
  allObligations: ReadonlyMap<string, ValidatedPolicyRule>,
  cache: Map<string, DueDateResult>,
  visiting: ReadonlySet<string>
): DueDateResult {
  if (rule.trigger === null) {
    return { dueAt: null, reason: "trigger is unresolved for this obligation; deadline cannot be computed" };
  }

  if (!rule.deadline || rule.deadline.type === "unspecified") {
    return { dueAt: null, reason: "policy does not specify a computable deadline for this obligation" };
  }

  if (rule.deadline.type === "absolute") {
    return { dueAt: rule.deadline.datetime, reason: "absolute deadline" };
  }

  if (rule.deadline.type === "relative") {
    const deadline = rule.deadline;
    const triggerEvent = log.all().find((e) => e.type === deadline.fromEvent);
    if (!triggerEvent) {
      return { dueAt: null, reason: `triggering event "${deadline.fromEvent}" has not occurred yet` };
    }
    return {
      dueAt: addDays(triggerEvent.occurredAt, deadline.amount, deadline.unit, calendar),
      reason: `computed from event "${deadline.fromEvent}"`,
    };
  }

  // type === "derived": resolve every anchor to a candidate date, skipping
  // anchors that cannot yet be resolved, then combine per `combinator`.
  const resolvedAnchorDates: string[] = [];
  const unresolvedAnchors: string[] = [];

  for (const anchor of rule.deadline.anchors) {
    const resolved = resolveAnchor(anchor, log, calendar, allObligations, cache, visiting);
    if (resolved !== null) {
      resolvedAnchorDates.push(resolved);
    } else {
      unresolvedAnchors.push(describeAnchor(anchor));
    }
  }

  if (resolvedAnchorDates.length === 0) {
    return {
      dueAt: null,
      reason: `no anchor date could be resolved yet (waiting on: ${unresolvedAnchors.join(", ")})`,
    };
  }

  const combined =
    rule.deadline.combinator === "earliest"
      ? resolvedAnchorDates.reduce((a, b) => (a < b ? a : b))
      : resolvedAnchorDates.reduce((a, b) => (a > b ? a : b));

  return {
    dueAt: addDays(combined, rule.deadline.amount, rule.deadline.unit, calendar),
    reason: `computed from ${rule.deadline.combinator} of [${resolvedAnchorDates.join(", ")}]`,
  };
}

function resolveAnchor(
  anchor: DeadlineAnchor,
  log: CaseEventLog,
  calendar: HolidayCalendar,
  allObligations: ReadonlyMap<string, ValidatedPolicyRule>,
  cache: Map<string, DueDateResult>,
  visiting: ReadonlySet<string>
): string | null {
  if ("fromEvent" in anchor) {
    const event = log.all().find((e) => e.type === anchor.fromEvent);
    return event ? event.occurredAt : null;
  }

  const referenced = allObligations.get(anchor.fromObligationDue);
  if (!referenced) {
    // A dangling reference is a rule-authoring defect, not a runtime
    // ambiguity — but the case engine still fails closed rather than
    // throwing, since this is reachable from otherwise-valid data if the
    // referenced rule was filtered out upstream (e.g. wrong kind).
    return null;
  }

  return resolveDueDate(referenced, log, calendar, allObligations, cache, visiting).dueAt;
}

function describeAnchor(anchor: DeadlineAnchor): string {
  return "fromEvent" in anchor ? `event:${anchor.fromEvent}` : `obligation-due:${anchor.fromObligationDue}`;
}

function computeObligationState(
  rule: ValidatedPolicyRule,
  party: "student" | "institution",
  log: CaseEventLog,
  evaluationAt: string,
  calendar: HolidayCalendar,
  allObligations: ReadonlyMap<string, ValidatedPolicyRule>,
  dueDateCache: Map<string, DueDateResult>
): ObligationState {
  const { dueAt, reason: dueReason } = resolveDueDate(rule, log, calendar, allObligations, dueDateCache, new Set());

  if (dueAt === null) {
    return { obligationId: rule.id, party, dueAt: null, status: "unknown", reason: dueReason };
  }

  const completionEventType = party === "student" ? "student_action_taken" : "institution_action_taken";
  const completed = log.ofType(completionEventType).find((e) => e.detail["obligationId"] === rule.id);

  if (completed) {
    return { obligationId: rule.id, party, dueAt, status: "met", reason: "recorded completion event found" };
  }

  if (evaluationAt > dueAt) {
    return { obligationId: rule.id, party, dueAt, status: "missed", reason: `deadline ${dueAt} has passed with no recorded completion` };
  }

  return { obligationId: rule.id, party, dueAt, status: "pending", reason: "deadline has not yet passed" };
}

function determineEligibility(procedure: ProcedureModel, log: CaseEventLog): EligibilityDetermination {
  const assertion = log.firstOfType("ground_asserted");
  if (!assertion) {
    return { result: "undetermined", reason: "no ground has been asserted yet" };
  }

  const groundId = assertion.detail["groundId"] as string | undefined;
  if (!groundId) {
    return { result: "undetermined", reason: "ground_asserted event is missing groundId" };
  }

  const validRules = procedure.eligibilityGrounds.filter((r) => r.groundsPolarity === "valid");
  const invalidRules = procedure.eligibilityGrounds.filter((r) => r.groundsPolarity === "invalid");

  for (const rule of invalidRules) {
    if (rule.groundsList?.ids.includes(groundId)) {
      return {
        result: "ineligible",
        reason: `ground "${groundId}" is explicitly listed as invalid`,
        citedRuleId: rule.id,
      };
    }
  }

  for (const rule of validRules) {
    if (rule.groundsList?.ids.includes(groundId)) {
      return { result: "eligible", reason: `ground "${groundId}" matches a valid ground`, citedRuleId: rule.id };
    }
  }

  // Not found in either list. Only a CLOSED valid-grounds list licenses a
  // confident "ineligible" conclusion here — OPEN_EXAMPLES or UNKNOWN closure
  // means the list is not proven exhaustive, so an unmatched ground must fail
  // into human review, not into a confident rejection.
  const closedValidRule = validRules.find((r) => r.groundsList?.closure === "CLOSED");
  if (closedValidRule) {
    return {
      result: "ineligible",
      reason: `ground "${groundId}" does not match any entry in the closed, exhaustive valid-grounds list`,
      citedRuleId: closedValidRule.id,
    };
  }

  return {
    result: "undetermined",
    reason: `ground "${groundId}" is not enumerated in the (non-exhaustive or unknown-closure) valid-grounds list; requires human review`,
  };
}
