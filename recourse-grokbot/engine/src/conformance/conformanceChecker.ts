import type { ConformanceResult, ConformanceStatus, ValidatedConformanceRule } from "../types/conformance.ts";
import type { CaseEvent } from "../types/case.ts";
import type { CaseEventLog } from "../case/eventLog.ts";
import type { HolidayCalendar } from "../calendar/businessDayCalendar.ts";
import { addDays, NO_HOLIDAYS } from "../calendar/businessDayCalendar.ts";

function cres(ruleId: string, status: ConformanceStatus, reason: string): ConformanceResult {
  return { ruleId, status, reason };
}

/**
 * A constraint's eventType fields are freeform strings (matching the
 * existing TriggerSpec.eventType convention in types/policy.ts), not the
 * closed CaseEventType union -- so this looks up by string equality over
 * the full trace rather than CaseEventLog#firstOfType, exactly like
 * case/caseTwin.ts already does for rule triggers/deadline anchors.
 */
function firstOccurrenceOf(log: CaseEventLog, eventType: string): CaseEvent | undefined {
  return log.all().find((e) => e.type === eventType);
}

/**
 * Compares one validated conformance rule against the case's append-only
 * event trace. Fail-closed toward UNDETERMINED, never NONCONFORMANT on
 * absence alone: a required event that has not (yet) been recorded is only
 * ever reported as a violation once an actually observed boundary/target
 * event in the trace makes that conclusion unavoidable -- never merely
 * because time has passed with nothing logged. See types/conformance.ts for
 * why each constraint kind is shaped to make this possible.
 *
 * Two stages, in this order: the constraint itself, then any exception the
 * governing source attaches to it (see applyException below). A requirement
 * that would be violated but whose stated waiver is unresolved on the record
 * resolves to UNDETERMINED, not NONCONFORMANT -- the same fail-closed
 * discipline, applied to the exception dimension.
 */
export function checkConformance(
  rule: ValidatedConformanceRule,
  log: CaseEventLog,
  calendar: HolidayCalendar = NO_HOLIDAYS
): ConformanceResult {
  return applyException(rule, checkConstraint(rule, log, calendar), log);
}

/**
 * Applies the rule's stated exception, if it has one, to an already-computed
 * constraint result.
 *
 * Only a NONCONFORMANT result is affected: an exception excuses a
 * requirement, it does not create one, so it can never turn a CONFORMANT or
 * UNDETERMINED finding into something worse. The three branches are purely
 * evidentiary and none of them infers anything from silence:
 *
 *   waiver event observed          -> EXCEPTION_APPLIES. The respondent got
 *                                     the process the policy provides.
 *   affirmative no-waiver observed -> the violation stands, now on a record
 *                                     that actually rules the waiver out.
 *   neither observed               -> UNDETERMINED. This is the branch that
 *                                     matters: reporting a violation here
 *                                     would mean inferring, from a case
 *                                     record that simply never mentions
 *                                     waivers, that no waiver was given.
 */
function applyException(
  rule: ValidatedConformanceRule,
  base: ConformanceResult,
  log: CaseEventLog
): ConformanceResult {
  const ex = rule.exception;
  if (!ex) return base;

  if (base.status !== "NONCONFORMANT") {
    return {
      ...base,
      exception: {
        exceptionId: ex.id,
        state: "NOT_APPLICABLE",
        description: ex.description,
        detail: `the requirement did not resolve to a violation, so the exception was never reached (finding: ${base.status})`,
      },
    };
  }

  const waived = firstOccurrenceOf(log, ex.establishedByEventType);
  if (waived) {
    return {
      ruleId: rule.id,
      status: "EXCEPTION_APPLIES",
      reason:
        `the requirement was not met as written -- ${base.reason} -- but the case record establishes that the exception stated in the ` +
        `governing source applies: "${ex.establishedByEventType}" was recorded at ${waived.occurredAt}. This is not a violation.`,
      exception: {
        exceptionId: ex.id,
        state: "APPLIES",
        description: ex.description,
        detail: `established by observed event "${ex.establishedByEventType}" at ${waived.occurredAt}`,
      },
    };
  }

  const excluded = firstOccurrenceOf(log, ex.negatedByEventType);
  if (excluded) {
    return {
      ...base,
      reason: `${base.reason} The exception stated in the governing source is ruled out: "${ex.negatedByEventType}" was recorded at ${excluded.occurredAt}.`,
      exception: {
        exceptionId: ex.id,
        state: "EXCLUDED",
        description: ex.description,
        detail: `ruled out by observed event "${ex.negatedByEventType}" at ${excluded.occurredAt}`,
      },
    };
  }

  return {
    ruleId: rule.id,
    status: "UNDETERMINED",
    reason:
      `the requirement was not met as written -- ${base.reason} -- but the governing source attaches an exception to it (${ex.description}), ` +
      `and the case record contains neither "${ex.establishedByEventType}" nor "${ex.negatedByEventType}". ` +
      `Whether this is a violation therefore cannot be determined. Absence of a recorded waiver is NOT evidence that no waiver was given; ` +
      `to resolve this, the record needs one of those two events.`,
    exception: {
      exceptionId: ex.id,
      state: "UNRESOLVED",
      description: ex.description,
      detail: `neither "${ex.establishedByEventType}" nor "${ex.negatedByEventType}" appears in the case record`,
    },
  };
}

function checkConstraint(
  rule: ValidatedConformanceRule,
  log: CaseEventLog,
  calendar: HolidayCalendar
): ConformanceResult {
  const c = rule.constraint;

  if (c.kind === "required_event") {
    const occurred = firstOccurrenceOf(log, c.eventType);
    if (occurred) {
      return cres(rule.id, "CONFORMANT", `required event "${c.eventType}" was recorded at ${occurred.occurredAt}`);
    }
    if (!c.closesUponEventType) {
      return cres(
        rule.id,
        "UNDETERMINED",
        `required event "${c.eventType}" has not been recorded yet, and no boundary event is defined to close the window -- absence alone is never treated as a violation`
      );
    }
    const boundary = firstOccurrenceOf(log, c.closesUponEventType);
    if (!boundary) {
      return cres(
        rule.id,
        "UNDETERMINED",
        `required event "${c.eventType}" has not occurred yet, and boundary event "${c.closesUponEventType}" has not occurred either -- window still open`
      );
    }
    return cres(
      rule.id,
      "NONCONFORMANT",
      `required event "${c.eventType}" was never recorded, and boundary event "${c.closesUponEventType}" already occurred at ${boundary.occurredAt}`
    );
  }

  if (c.kind === "required_before") {
    const boundary = firstOccurrenceOf(log, c.beforeEventType);
    if (!boundary) {
      return cres(
        rule.id,
        "UNDETERMINED",
        `boundary event "${c.beforeEventType}" has not occurred yet -- required-before condition not yet decidable`
      );
    }
    const subject = firstOccurrenceOf(log, c.eventType);
    if (!subject) {
      return cres(
        rule.id,
        "NONCONFORMANT",
        `boundary event "${c.beforeEventType}" occurred at ${boundary.occurredAt} but "${c.eventType}" was never recorded`
      );
    }
    if (subject.occurredAt < boundary.occurredAt) {
      return cres(
        rule.id,
        "CONFORMANT",
        `"${c.eventType}" (${subject.occurredAt}) occurred before "${c.beforeEventType}" (${boundary.occurredAt})`
      );
    }
    return cres(
      rule.id,
      "NONCONFORMANT",
      `"${c.eventType}" (${subject.occurredAt}) did not occur before "${c.beforeEventType}" (${boundary.occurredAt})`
    );
  }

  // kind === "minimum_lead_time"
  const anchor = firstOccurrenceOf(log, c.anchorEventType);
  if (!anchor) {
    return cres(rule.id, "UNDETERMINED", `anchor event "${c.anchorEventType}" has not occurred yet`);
  }
  const target = firstOccurrenceOf(log, c.targetEventType);
  if (!target) {
    return cres(
      rule.id,
      "UNDETERMINED",
      `anchor event "${c.anchorEventType}" occurred at ${anchor.occurredAt} but target event "${c.targetEventType}" has not occurred yet`
    );
  }

  const requiredBy = addDays(anchor.occurredAt, c.minimum.amount, c.minimum.unit, calendar);
  if (target.occurredAt >= requiredBy) {
    return cres(
      rule.id,
      "CONFORMANT",
      `"${c.targetEventType}" (${target.occurredAt}) occurred on or after ${requiredBy}, satisfying the minimum ${c.minimum.amount} ${c.minimum.unit}(s) after "${c.anchorEventType}" (${anchor.occurredAt})`
    );
  }
  return cres(
    rule.id,
    "NONCONFORMANT",
    `"${c.targetEventType}" occurred at ${target.occurredAt}, before the minimum ${c.minimum.amount} ${c.minimum.unit}(s) from "${c.anchorEventType}" (${anchor.occurredAt}) had elapsed (required on or after ${requiredBy})`
  );
}

/** Batch form of checkConformance. */
export function checkAllConformance(
  rules: ReadonlyArray<ValidatedConformanceRule>,
  log: CaseEventLog,
  calendar: HolidayCalendar = NO_HOLIDAYS
): ConformanceResult[] {
  return rules.map((r) => checkConformance(r, log, calendar));
}
