import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { evaluateFixtureFile } from "../src/cli/evaluate.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(__dirname, "..", "fixtures", "uic-case.json");

/**
 * fixtures/uic-case.json encodes the real UIC Student Academic Grievance
 * Procedures (Effective April 27, 2017) two-sided clock: the Administrative
 * Officer's 10-business-day decision deadline (Section IV.E), and the
 * student's 5-business-day appeal-to-Grievance-Officer deadline computed via
 * Section IV.A.4's derived "whichever date is earlier" rule (decision
 * received, or decision due). See fixtures/uic-case.json's own "_note" field
 * for the source and for what was fabricated in an earlier draft and removed.
 */
test("end-to-end: recourse evaluate produces a deterministic case-state result with no LLM involved", () => {
  const result = evaluateFixtureFile(fixturePath);

  assert.equal(result.rejectedRuleCount, 0);
  assert.equal(result.validatedRuleCount, 2);
  assert.equal(result.caseState.eligibility.result, "undetermined", "this fixture asserts no ground; not applicable here");

  const institutionObligation = result.caseState.obligations.find((o) => o.party === "institution");
  const studentObligation = result.caseState.obligations.find((o) => o.party === "student");

  // AO decision due 10 business days after grievance_filed (2026-09-01),
  // skipping the weekend and the 2026-09-07 holiday: 2026-09-16.
  assert.equal(institutionObligation?.dueAt, "2026-09-16");
  assert.equal(institutionObligation?.status, "missed");

  // Student's appeal-to-GO deadline is derived: earliest of
  // [institution_action_taken (never occurred), AO obligation's due date] = 2026-09-16,
  // plus 5 business days = 2026-09-23. The institution's silence does not
  // freeze this clock — it starts it from the deemed-due date.
  assert.equal(studentObligation?.dueAt, "2026-09-23");
  assert.equal(studentObligation?.status, "missed");

  assert.ok(result.deviations.some((d) => d.type === "INSTITUTION_DEADLINE_EXCEEDED"));
  assert.ok(result.deviations.some((d) => d.type === "STUDENT_DEADLINE_EXCEEDED"));
  // No eligibility_grounds rule is defined in this fixture, so an
  // unasserted ground must not be reported as a policy ambiguity.
  assert.ok(!result.deviations.some((d) => d.type === "POLICY_SOURCE_AMBIGUITY"));
});

test("end-to-end: evaluating the same fixture twice produces byte-identical results (determinism)", () => {
  const first = evaluateFixtureFile(fixturePath);
  const second = evaluateFixtureFile(fixturePath);
  assert.deepEqual(first, second);
});
