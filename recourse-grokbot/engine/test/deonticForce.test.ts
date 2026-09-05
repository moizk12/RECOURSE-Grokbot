import test from "node:test";
import assert from "node:assert/strict";
import { validateRule } from "../src/validation/ruleValidator.ts";
import { buildProcedureModel } from "../src/procedure/procedureModel.ts";
import { baseCandidate } from "./support/helpers.ts";

test("MAY cannot become MUST: an advisory rule is never placed in the binding obligations bucket", () => {
  const candidate = baseCandidate({ id: "r-may", deonticForce: "MAY" });
  const result = validateRule(candidate);
  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.value.deonticForce, "MAY", "validator must not upgrade the recorded force");

  const model = buildProcedureModel([result.value]);
  assert.equal(model.studentObligations.length, 0, "MAY rules must not appear as binding student obligations");
  assert.equal(model.advisoryRules.length, 1);
});

test("an unrecognized deontic force string is rejected, not coerced to a known category", () => {
  const candidate = baseCandidate({ deonticForce: "SUGGESTED" as unknown as "MAY" });
  const result = validateRule(candidate);
  assert.equal(result.ok, false);
});

test("SHOULD/NORMALLY/ENCOURAGED all remain distinct and advisory, not merged into MUST", () => {
  for (const force of ["SHOULD", "NORMALLY", "ENCOURAGED"] as const) {
    const candidate = baseCandidate({ id: `r-${force}`, deonticForce: force });
    const result = validateRule(candidate);
    assert.equal(result.ok, true);
    if (!result.ok) continue;
    assert.equal(result.value.deonticForce, force);
    const model = buildProcedureModel([result.value]);
    assert.equal(model.studentObligations.length, 0);
    assert.equal(model.advisoryRules.length, 1);
  }
});

test("validated rules are frozen — provenance and deonticForce cannot be mutated after validation", () => {
  const result = validateRule(baseCandidate({ deonticForce: "MAY" }));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.throws(() => {
    // @ts-expect-error intentional mutation attempt for the test
    result.value.deonticForce = "MUST";
  });
});
