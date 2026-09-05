import test from "node:test";
import assert from "node:assert/strict";
import { checkWarrant } from "../src/warrant/warrantValidator.ts";
import { captureSource, hashContent, SourceStore } from "../src/warrant/sourceStore.ts";
import { proposeAndValidate } from "../src/warrant/pipeline.ts";
import { baseCandidate } from "./support/helpers.ts";

const REAL_CONTENT =
  "Section IV.E: The Administrative Officer's decision must be issued in writing, within ten (10) days following their receipt of the Academic Grievance.";

function realSource() {
  return captureSource({
    sourceId: "src-1",
    requestedUrl: "https://example.edu/policy",
    retrievedAt: "2026-09-05T00:00:00Z",
    content: REAL_CONTENT,
  });
}

function realStore() {
  return new SourceStore([realSource()]);
}

function candidateWithWarrant(overrides: Record<string, unknown> = {}, warrantOverrides: Record<string, unknown> = {}) {
  return baseCandidate({
    warrant: {
      sourceId: "src-1",
      contentHash: hashContent(REAL_CONTENT),
      span: { start: 0, end: REAL_CONTENT.length },
      quotedText: REAL_CONTENT,
      claimType: "directly_stated",
      ...warrantOverrides,
    },
    ...overrides,
  } as never);
}

test("a candidate with no warrant at all is rejected", () => {
  const candidate = baseCandidate({ warrant: undefined });
  const outcome = checkWarrant(candidate, realStore());
  assert.equal(outcome.status, "rejected");
  if (outcome.status === "rejected") {
    assert.ok(outcome.errors.some((e) => e.field === "warrant"));
  }
});

test("a correctly warranted, directly-stated candidate is auto-promotable", () => {
  const candidate = candidateWithWarrant();
  const outcome = checkWarrant(candidate, realStore());
  assert.equal(outcome.status, "auto_promotable");
});

test("adversarial: fabricated quote (quotedText does not match the captured source at the cited span) is rejected", () => {
  const candidate = candidateWithWarrant(
    {},
    { quotedText: "Students have unlimited time to appeal any decision whatsoever." }
  );
  const outcome = checkWarrant(candidate, realStore());
  assert.equal(outcome.status, "rejected");
  if (outcome.status === "rejected") {
    assert.ok(outcome.errors.some((e) => e.field === "warrant.quotedText"));
  }
});

test("adversarial: wrong source id (sourceId not present in the capture store) is rejected", () => {
  const candidate = candidateWithWarrant({}, { sourceId: "src-does-not-exist" });
  const outcome = checkWarrant(candidate, realStore());
  assert.equal(outcome.status, "rejected");
  if (outcome.status === "rejected") {
    assert.ok(outcome.errors.some((e) => e.field === "warrant.sourceId"));
  }
});

test("adversarial: changed source hash (candidate pins a hash the live capture no longer has) is rejected", () => {
  const candidate = candidateWithWarrant({}, { contentHash: "sha256:0000000000000000000000000000000000000000000000000000000000000" });
  const outcome = checkWarrant(candidate, realStore());
  assert.equal(outcome.status, "rejected");
  if (outcome.status === "rejected") {
    assert.ok(outcome.errors.some((e) => e.field === "warrant.contentHash"));
  }
});

test("adversarial: source re-captured with different content invalidates a previously valid warrant (hash drift)", () => {
  const originalHash = hashContent(REAL_CONTENT);
  const driftedStore = new SourceStore([
    captureSource({
      sourceId: "src-1",
      requestedUrl: "https://example.edu/policy",
      retrievedAt: "2026-10-01T00:00:00Z",
      content: REAL_CONTENT + " This sentence was added after the policy was quietly edited.",
    }),
  ]);
  const candidate = candidateWithWarrant({}, { contentHash: originalHash });
  const outcome = checkWarrant(candidate, driftedStore);
  assert.equal(outcome.status, "rejected");
  if (outcome.status === "rejected") {
    assert.ok(outcome.errors.some((e) => e.field === "warrant.contentHash"));
  }
});

test("adversarial: missing span is rejected", () => {
  const candidate = candidateWithWarrant({}, { span: undefined });
  const outcome = checkWarrant(candidate, realStore());
  assert.equal(outcome.status, "rejected");
  if (outcome.status === "rejected") {
    assert.ok(outcome.errors.some((e) => e.field === "warrant.span"));
  }
});

test("adversarial: ambiguous span (end <= start) is rejected", () => {
  const candidate = candidateWithWarrant({}, { span: { start: 20, end: 20 } });
  const outcome = checkWarrant(candidate, realStore());
  assert.equal(outcome.status, "rejected");
  if (outcome.status === "rejected") {
    assert.ok(outcome.errors.some((e) => e.field === "warrant.span"));
  }
});

test("adversarial: span out of bounds for the captured source is rejected", () => {
  const candidate = candidateWithWarrant({}, { span: { start: 0, end: REAL_CONTENT.length + 500 } });
  const outcome = checkWarrant(candidate, realStore());
  assert.equal(outcome.status, "rejected");
  if (outcome.status === "rejected") {
    assert.ok(outcome.errors.some((e) => e.field === "warrant.span"));
  }
});

test("adversarial: structurally valid warrant whose evidence cannot actually be found at the cited offsets is rejected", () => {
  // span/hash/sourceId are all individually well-formed and point at a real,
  // correctly-hashed capture -- but the offsets land on the wrong slice of
  // text, so the cited evidence does not exist where claimed.
  const candidate = candidateWithWarrant({}, { span: { start: 10, end: 40 }, quotedText: REAL_CONTENT.slice(0, 30) });
  const outcome = checkWarrant(candidate, realStore());
  assert.equal(outcome.status, "rejected");
  if (outcome.status === "rejected") {
    assert.ok(outcome.errors.some((e) => e.field === "warrant.quotedText"));
  }
});

test("an 'inferred' claim, even with verified evidence, fails into review rather than being auto-promoted", () => {
  const candidate = candidateWithWarrant({}, { claimType: "inferred" });
  const outcome = checkWarrant(candidate, realStore());
  assert.equal(outcome.status, "needs_review");
});

test("unrecognized claimType is rejected, not defaulted to either category", () => {
  const candidate = candidateWithWarrant({}, { claimType: "probably_true" });
  const outcome = checkWarrant(candidate, realStore());
  assert.equal(outcome.status, "rejected");
  if (outcome.status === "rejected") {
    assert.ok(outcome.errors.some((e) => e.field === "warrant.claimType"));
  }
});

test("pipeline: a warrant-verified, directly-stated candidate that is otherwise structurally invalid still fails at rule validation", () => {
  const candidate = candidateWithWarrant({ actor: undefined });
  const outcome = proposeAndValidate(candidate, realStore());
  assert.equal(outcome.status, "rejected");
  if (outcome.status === "rejected") {
    assert.ok(outcome.errors.some((e) => e.field === "actor"));
  }
});

test("pipeline: a candidate with a fabricated warrant never reaches rule validation, even if otherwise structurally perfect", () => {
  const candidate = candidateWithWarrant({}, { sourceId: "nonexistent" });
  const outcome = proposeAndValidate(candidate, realStore());
  assert.equal(outcome.status, "rejected");
  if (outcome.status === "rejected") {
    assert.ok(outcome.errors.some((e) => e.field === "warrant.sourceId"));
  }
});

test("pipeline: a fully verified, directly-stated candidate is validated end to end", () => {
  const candidate = candidateWithWarrant();
  const outcome = proposeAndValidate(candidate, realStore());
  assert.equal(outcome.status, "validated");
});
