import test from "node:test";
import assert from "node:assert/strict";
import { validateRule } from "../src/validation/ruleValidator.ts";
import { detectConflicts } from "../src/procedure/procedureModel.ts";
import { baseCandidate } from "./support/helpers.ts";

test("two sources with different scopes (different trigger event types) are not automatically conflicts", () => {
  const a = validateRule(baseCandidate({ id: "a", trigger: { eventType: "academic_dismissal" }, authorityLevel: "campus_wide" }));
  const b = validateRule(
    baseCandidate({ id: "b", trigger: { eventType: "conduct_dismissal" }, authorityLevel: "college_level" })
  );
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  if (!a.ok || !b.ok) return;

  const conflicts = detectConflicts([a.value, b.value]);
  assert.equal(conflicts.length, 0, "different trigger scope must not be flagged as a conflict");
});

test("two sources at different authority levels but the SAME scope with incompatible force ARE flagged", () => {
  const a = validateRule(
    baseCandidate({ id: "a", deonticForce: "MUST", authorityLevel: "campus_wide" })
  );
  const b = validateRule(
    baseCandidate({ id: "b", deonticForce: "MUST_NOT", authorityLevel: "college_level" })
  );
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  if (!a.ok || !b.ok) return;

  const conflicts = detectConflicts([a.value, b.value]);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0]?.reason.includes("incompatible deontic force"), true);
});

test("same scope, same force, different deadline amounts ARE flagged as conflicting", () => {
  const a = validateRule(baseCandidate({ id: "a", deadline: { type: "relative", amount: 10, unit: "calendar_day", fromEvent: "decision_notice_received" } }));
  const b = validateRule(baseCandidate({ id: "b", deadline: { type: "relative", amount: 15, unit: "calendar_day", fromEvent: "decision_notice_received" } }));
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  if (!a.ok || !b.ok) return;

  const conflicts = detectConflicts([a.value, b.value]);
  assert.equal(conflicts.length, 1);
});

test("same scope, both MAY (advisory, compatible), no deadline difference: not a conflict", () => {
  const a = validateRule(baseCandidate({ id: "a", deonticForce: "MAY", deadline: undefined }));
  const b = validateRule(baseCandidate({ id: "b", deonticForce: "SHOULD", deadline: undefined }));
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  if (!a.ok || !b.ok) return;

  const conflicts = detectConflicts([a.value, b.value]);
  assert.equal(conflicts.length, 0);
});
