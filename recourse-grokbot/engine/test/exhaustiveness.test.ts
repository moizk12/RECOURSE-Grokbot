import test from "node:test";
import assert from "node:assert/strict";
import { validateRule } from "../src/validation/ruleValidator.ts";
import { buildProcedureModel } from "../src/procedure/procedureModel.ts";
import { computeCaseState } from "../src/case/caseTwin.ts";
import { CaseEventLog } from "../src/case/eventLog.ts";
import { baseCandidate } from "./support/helpers.ts";

function groundsRule(overrides: Partial<Parameters<typeof baseCandidate>[0]> = {}) {
  return baseCandidate({
    id: "grounds-1",
    kind: "eligibility_grounds",
    actor: "committee",
    action: "evaluate_grounds",
    trigger: { eventType: "ground_asserted" },
    deadline: undefined,
    groundsList: { ids: ["procedural_error", "bias"], closure: "OPEN_EXAMPLES" },
    groundsPolarity: "valid",
    ...overrides,
  });
}

test("examples cannot silently become an exhaustive list: closure=CLOSED without evidence is rejected", () => {
  const candidate = groundsRule({ groundsList: { ids: ["procedural_error", "bias"], closure: "CLOSED" } });
  const result = validateRule(candidate);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.errors.some((e) => e.field === "groundsList.closure"));
  }
});

test("closure=CLOSED with explicit exhaustivenessEvidence is accepted", () => {
  const candidate = groundsRule({
    groundsList: {
      ids: ["procedural_error", "bias"],
      closure: "CLOSED",
      exhaustivenessEvidence: "The only grounds for grievance are procedural error and non-academic bias.",
    },
  });
  const result = validateRule(candidate);
  assert.equal(result.ok, true);
});

test("an OPEN_EXAMPLES list does not license a confident ineligible conclusion for an unmatched ground", () => {
  const result = validateRule(groundsRule());
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const procedure = buildProcedureModel([result.value]);
  const log = new CaseEventLog([
    { eventId: "e1", type: "ground_asserted", occurredAt: "2026-01-05T00:00:00Z", detail: { groundId: "some_other_ground" } },
  ]);
  const state = computeCaseState(procedure, log, "2026-01-06T00:00:00Z");

  assert.equal(state.eligibility.result, "undetermined", "must fail into human review, not confident rejection");
});

test("a CLOSED, evidenced list DOES license a confident ineligible conclusion for an unmatched ground", () => {
  const result = validateRule(
    groundsRule({
      groundsList: {
        ids: ["procedural_error", "bias"],
        closure: "CLOSED",
        exhaustivenessEvidence: "The only grounds for grievance are procedural error and non-academic bias.",
      },
    })
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const procedure = buildProcedureModel([result.value]);
  const log = new CaseEventLog([
    { eventId: "e1", type: "ground_asserted", occurredAt: "2026-01-05T00:00:00Z", detail: { groundId: "some_other_ground" } },
  ]);
  const state = computeCaseState(procedure, log, "2026-01-06T00:00:00Z");

  assert.equal(state.eligibility.result, "ineligible");
});
