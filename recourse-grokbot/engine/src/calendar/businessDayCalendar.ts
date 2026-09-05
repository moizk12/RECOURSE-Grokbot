/**
 * Deterministic date engine. The LLM never performs deadline arithmetic —
 * this module is the only place in the codebase that adds days to a date,
 * and it takes no input from model output, only from ValidatedPolicyRule
 * deadline specs and CaseEvent timestamps.
 *
 * Dates are handled as UTC calendar days (YYYY-MM-DD) to avoid timezone drift
 * across the arithmetic; callers pass ISO date or date-time strings.
 */

export interface HolidayCalendar {
  /** Returns true if the given UTC calendar date (YYYY-MM-DD) is a published institution closure. */
  isHoliday(dateISO: string): boolean;
}

/** MVP calendar backed by a fixed, explicit list of holiday dates. */
export class FixedHolidayCalendar implements HolidayCalendar {
  private readonly holidays: ReadonlySet<string>;

  constructor(holidayDatesISO: string[]) {
    this.holidays = new Set(holidayDatesISO);
  }

  isHoliday(dateISO: string): boolean {
    return this.holidays.has(dateISO);
  }
}

export const NO_HOLIDAYS: HolidayCalendar = new FixedHolidayCalendar([]);

function toDateOnly(dateISO: string): Date {
  const datePart = dateISO.length > 10 ? dateISO.slice(0, 10) : dateISO;
  const parts = datePart.split("-").map(Number);
  const y = parts[0] ?? NaN;
  const m = parts[1] ?? NaN;
  const d = parts[2] ?? NaN;
  return new Date(Date.UTC(y, m - 1, d));
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function isWeekend(d: Date): boolean {
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}

export function isBusinessDay(dateISO: string, calendar: HolidayCalendar): boolean {
  const d = toDateOnly(dateISO);
  if (isWeekend(d)) return false;
  if (calendar.isHoliday(toISODate(d))) return false;
  return true;
}

/**
 * Adds `amount` days to `startISO`. For unit "calendar_day", plain calendar
 * arithmetic. For unit "business_day", counts only business days (skipping
 * weekends and calendar holidays), matching the common policy phrasing
 * "N business/working days after X" where the start event day itself does
 * not count as day 1.
 */
export function addDays(
  startISO: string,
  amount: number,
  unit: "calendar_day" | "business_day",
  calendar: HolidayCalendar = NO_HOLIDAYS
): string {
  if (amount < 0) {
    throw new Error("addDays: amount must be non-negative");
  }

  let cursor = toDateOnly(startISO);

  if (unit === "calendar_day") {
    cursor = new Date(cursor.getTime() + amount * 86400000);
    return toISODate(cursor);
  }

  let remaining = amount;
  while (remaining > 0) {
    cursor = new Date(cursor.getTime() + 86400000);
    if (isBusinessDay(toISODate(cursor), calendar)) {
      remaining -= 1;
    }
  }
  return toISODate(cursor);
}
