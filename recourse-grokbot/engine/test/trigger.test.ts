import test from "node:test";
import assert from "node:assert/strict";
import { validateRule } from "../src/validation/ruleValidator.ts";
import { buildProcedureModel } from "../src/procedure/procedureModel.ts";
import { computeCaseState } from "../src/case/caseTwin.ts";
import { CaseEventLog } from "../src/case/eventLog.ts";
import { baseCandidate } from "./support/helpers.ts";

test("a candidate rule that omits trigger entirely (undefined) is rejected at validation", () => {
  const candidate = baseCandidate({ trigger: undefined });
  const result = validateRule(candidate);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.errors.some((e) => e.field === "trigger"));
  }
});

test("an explicitly null (ambiguous/unresolved) trigger validates, but blocks deadline computation", () => {
  const candidate = baseCandidate({ trigger: null });
  const result = validateRule(candidate);
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const procedure = buildProcedureModel([result.value]);
  const log = new CaseEventLog();
  const state = computeCaseState(procedure, log, "2026-02-01T00:00:00Z");

  assert.equal(state.obligations.length, 1);
  assert.equal(state.obligations[0]?.status, "unknown");
  assert.equal(state.obligations[0]?.dueAt, null);
});

test("a resolved trigger whose event has not yet occurred also yields no deadline, without guessing", () => {
  const result = validateRule(baseCandidate());
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const procedure = buildProcedureModel([result.value]);
  const log = new CaseEventLog(); // decision_notice_received never logged
  const state = computeCaseState(procedure, log, "2026-02-01T00:00:00Z");

  assert.equal(state.obligations[0]?.status, "unknown");
  assert.equal(state.obligations[0]?.dueAt, null);
});
