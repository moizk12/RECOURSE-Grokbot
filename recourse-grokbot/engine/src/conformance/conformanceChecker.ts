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
 */
export function checkConformance(
  rule: ValidatedConformanceRule,
  log: CaseEventLog,
  calendar: HolidayCalendar = NO_HOLIDAYS
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
