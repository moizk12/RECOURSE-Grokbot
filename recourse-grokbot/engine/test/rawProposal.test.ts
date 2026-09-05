import test from "node:test";
import assert from "node:assert/strict";
import { resolveRawProposal, proposeRawAndValidate } from "../src/warrant/rawProposal.ts";
import type { RawClaimProposal } from "../src/warrant/rawProposal.ts";
import { captureSource, SourceStore } from "../src/warrant/sourceStore.ts";
import { baseCandidate } from "./support/helpers.ts";

const REAL_CONTENT =
  "Section IV.E: The Administrative Officer's decision must be issued in writing, within ten (10) days following their receipt of the Academic Grievance.";

function realSource(content: string = REAL_CONTENT) {
  return captureSource({
    sourceId: "src-1",
    requestedUrl: "https://example.edu/policy",
    retrievedAt: "2026-09-05T00:00:00Z",
    content,
  });
}

function realStore(content: string = REAL_CONTENT) {
  return new SourceStore([realSource(content)]);
}

/** A RawClaimProposal citing the real UIC-style source, with the rule claim but no warrant fields. */
function rawProposal(overrides: Partial<RawClaimProposal> = {}): RawClaimProposal {
  return {
    rule: baseCandidate(),
    sourceId: "src-1",
    quotedText: "must be issued in writing, within ten (10) days",
    claimType: "directly_stated",
    ...overrides,
  };
}

test("valid UIC path: a unique exact quote resolves into a full warrant (contentHash + span derived, not supplied)", () => {
  const store = realStore();
  const proposal = rawProposal();

  const resolved = resolveRawProposal(proposal, store);
  assert.equal(resolved.status, "resolved");
  if (resolved.status !== "resolved") return;

  const warrant = resolved.candidate.warrant;
  assert.ok(warrant);
  assert.equal(warrant?.sourceId, "src-1");
  assert.equal(warrant?.contentHash, realSource().contentHash);
  assert.equal(warrant?.quotedText, proposal.quotedText);
  const expectedStart = REAL_CONTENT.indexOf(proposal.quotedText);
  assert.equal(warrant?.span.start, expectedStart);
  assert.equal(warrant?.span.end, expectedStart + proposal.quotedText.length);

  const outcome = proposeRawAndValidate(proposal, store);
  assert.equal(outcome.status, "validated");
});

test("zero matches: quoted text absent from the captured source is rejected, never assigned a guessed span", () => {
  const store = realStore();
  const proposal = rawProposal({ quotedText: "Students have unlimited time to appeal any decision whatsoever." });

  const resolved = resolveRawProposal(proposal, store);
  assert.equal(resolved.status, "rejected");
  if (resolved.status === "rejected") {
    assert.ok(resolved.errors.some((e) => e.field === "rawProposal.quotedText"));
  }

  const outcome = proposeRawAndValidate(proposal, store);
  assert.equal(outcome.status, "rejected");
});

test("duplicate matches: quoted text appearing more than once is routed to review, not guessed", () => {
  const repeatedContent = `${REAL_CONTENT} A student must file within 10 days. A student must file within 10 days.`;
  const store = realStore(repeatedContent);
  const proposal = rawProposal({ quotedText: "A student must file within 10 days." });

  const resolved = resolveRawProposal(proposal, store);
  assert.equal(resolved.status, "needs_review");
  if (resolved.status === "needs_review") {
    assert.match(resolved.reason, /ambiguous/);
    assert.equal(resolved.candidate.warrant, undefined, "an ambiguous match must never carry a guessed warrant");
  }

  const outcome = proposeRawAndValidate(proposal, store);
  assert.equal(outcome.status, "needs_review");
});

test("stale/tampered source: a proposal that resolved once fails cleanly after the underlying source content changes", () => {
  const originalStore = realStore();
  const proposal = rawProposal();

  const firstAttempt = resolveRawProposal(proposal, originalStore);
  assert.equal(firstAttempt.status, "resolved");

  // Source is quietly edited (or the model's proposal is stale) so the
  // previously-matching quote no longer exists verbatim in the capture.
  const tamperedStore = realStore(
    REAL_CONTENT.replace("must be issued in writing, within ten (10) days", "may be issued whenever convenient")
  );

  const secondAttempt = resolveRawProposal(proposal, tamperedStore);
  assert.equal(secondAttempt.status, "rejected");
  if (secondAttempt.status === "rejected") {
    assert.ok(secondAttempt.errors.some((e) => e.field === "rawProposal.quotedText"));
  }

  const outcome = proposeRawAndValidate(proposal, tamperedStore);
  assert.equal(outcome.status, "rejected");
});

test("wrong source id: sourceId not present in the capture store is rejected", () => {
  const store = realStore();
  const proposal = rawProposal({ sourceId: "src-does-not-exist" });

  const resolved = resolveRawProposal(proposal, store);
  assert.equal(resolved.status, "rejected");
  if (resolved.status === "rejected") {
    assert.ok(resolved.errors.some((e) => e.field === "rawProposal.sourceId"));
  }
});

test("the model can never supply its own hash or span: RawClaimProposal has no such fields, and the resolved contentHash always matches the live capture", () => {
  const store = realStore();
  const proposal = rawProposal();
  const resolved = resolveRawProposal(proposal, store);
  assert.equal(resolved.status, "resolved");
  if (resolved.status === "resolved") {
    assert.equal(resolved.candidate.warrant?.contentHash, realSource().contentHash);
  }
  // TypeScript enforces the absence of these fields at compile time; this is
  // a runtime sanity check that nothing on the proposal object leaks through.
  assert.equal((proposal as unknown as Record<string, unknown>).contentHash, undefined);
  assert.equal((proposal as unknown as Record<string, unknown>).span, undefined);
});

test("an 'inferred' raw proposal, even with a uniquely verified quote, still fails into review through the full pipeline", () => {
  const store = realStore();
  const proposal = rawProposal({ claimType: "inferred" });
  const outcome = proposeRawAndValidate(proposal, store);
  assert.equal(outcome.status, "needs_review");
});
