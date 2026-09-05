import test from "node:test";
import assert from "node:assert/strict";
import { validateRule } from "../src/validation/ruleValidator.ts";
import { baseCandidate } from "./support/helpers.ts";

test("a rule without provenance cannot execute", () => {
  const candidate = baseCandidate({ provenance: undefined });
  const result = validateRule(candidate);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.errors.some((e) => e.field === "provenance"));
  }
});

test("a rule with partial provenance (missing sourceSpan) cannot execute", () => {
  const candidate = baseCandidate({
    provenance: {
      sourceUrl: "https://example.edu/policy",
      retrievedAt: "2026-01-01T00:00:00Z",
      actor: "student",
      // sourceSpan omitted
    },
  });
  const result = validateRule(candidate);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.errors.some((e) => e.field === "provenance.sourceSpan"));
  }
});

test("a rule with a malformed source URL cannot execute", () => {
  const candidate = baseCandidate({
    provenance: {
      sourceUrl: "not-a-url",
      retrievedAt: "2026-01-01T00:00:00Z",
      sourceSpan: "quoted text",
      actor: "student",
    },
  });
  const result = validateRule(candidate);
  assert.equal(result.ok, false);
});

test("a fully-provenanced, structurally valid rule validates successfully", () => {
  const result = validateRule(baseCandidate());
  assert.equal(result.ok, true);
});
