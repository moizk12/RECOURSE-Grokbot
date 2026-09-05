import test from "node:test";
import assert from "node:assert/strict";
import { addDays, isBusinessDay, FixedHolidayCalendar, NO_HOLIDAYS } from "../src/calendar/businessDayCalendar.ts";

test("calendar_day arithmetic ignores weekends entirely", () => {
  // 2026-01-01 is a Thursday.
  assert.equal(addDays("2026-01-01", 5, "calendar_day"), "2026-01-06");
});

test("business_day arithmetic skips Saturday and Sunday", () => {
  // 2026-01-01 is Thursday. +1 business day -> Fri Jan 2. +2 -> Mon Jan 5 (skips Sat/Sun).
  assert.equal(addDays("2026-01-01", 1, "business_day"), "2026-01-02");
  assert.equal(addDays("2026-01-01", 2, "business_day"), "2026-01-05");
});

test("a run of business days spanning a weekend lands on the correct date", () => {
  // 2026-01-02 is Friday. +1 business day must skip the weekend and land on Monday.
  assert.equal(addDays("2026-01-02", 1, "business_day"), "2026-01-05");
});

test("isBusinessDay correctly identifies Saturday/Sunday as non-business days", () => {
  assert.equal(isBusinessDay("2026-01-03", NO_HOLIDAYS), false); // Saturday
  assert.equal(isBusinessDay("2026-01-04", NO_HOLIDAYS), false); // Sunday
  assert.equal(isBusinessDay("2026-01-05", NO_HOLIDAYS), true); // Monday
});

test("business_day arithmetic also skips configured holidays, not just weekends", () => {
  const calendar = new FixedHolidayCalendar(["2026-01-05"]); // Monday holiday
  // Friday 2026-01-02 + 1 business day: Sat/Sun skipped, Mon is a holiday, lands Tue 2026-01-06.
  assert.equal(addDays("2026-01-02", 1, "business_day", calendar), "2026-01-06");
});

test("addDays rejects a negative amount rather than silently doing something", () => {
  assert.throws(() => addDays("2026-01-01", -1, "calendar_day"));
});
