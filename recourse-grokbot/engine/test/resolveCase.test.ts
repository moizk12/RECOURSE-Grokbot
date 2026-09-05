import test from "node:test";
import assert from "node:assert/strict";
import { resolveCase } from "../src/cli/resolveCase.ts";
import type { ResolveCaseInput } from "../src/cli/resolveCase.ts";
import { baseCandidate } from "./support/helpers.ts";

const POLICY_TEXT =
  "Section IV.E: The Administrative Officer's decision must be issued in writing, within ten (10) days following their receipt of the Academic Grievance.";

/** No real network call -- exercises the exact acquireSource code path via an injected fetch, same technique as test/acquireSource.test.ts. */
function fakeFetch(body: string): typeof fetch {
  return (async () =>
    ({
      ok: true,
      status: 200,
      url: "https://example.edu/policy",
      headers: { get: (name: string) => (name.toLowerCase() === "content-type" ? "text/plain" : null) },
      arrayBuffer: async () => new TextEncoder().encode(body).buffer,
    }) as unknown as Response) as unknown as typeof fetch;
}

function input(overrides: Partial<ResolveCaseInput> = {}): ResolveCaseInput {
  return {
    evaluationAt: "2026-10-15T00:00:00Z",
    holidays: [],
    sourceAmbiguities: [],
    sourcesToAcquire: [{ sourceId: "src-1", requestedUrl: "https://example.edu/policy" }],
    rawProposals: [
      {
        rule: baseCandidate(),
        sourceId: "src-1",
        quotedText: "must be issued in writing, within ten (10) days",
        claimType: "directly_stated",
      },
    ],
    events: [{ eventId: "e1", type: "decision_notice_received", occurredAt: "2026-09-01T00:00:00Z", detail: {} }],
    ...overrides,
  };
}

test("resolveCase: live-acquired source -> raw proposal -> warrant -> rule validation -> case state, end to end", async () => {
  const result = await resolveCase(input(), { fetchImpl: fakeFetch(POLICY_TEXT) });

  assert.equal(result.rejectedRuleCount, 0);
  assert.equal(result.validatedRuleCount, 1);
  assert.equal(result.needsReviewCount, 0);
  assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0]?.sourceId, "src-1");
  assert.equal(result.sources[0]?.requestedUrl, "https://example.edu/policy");

  const obligation = result.caseState.obligations.find((o) => o.obligationId === baseCandidate().id);
  assert.equal(obligation?.status, "missed");
});

test("resolveCase: a quote absent from the live-acquired document is rejected, never guessed", async () => {
  const result = await resolveCase(
    input({
      rawProposals: [
        {
          rule: baseCandidate(),
          sourceId: "src-1",
          quotedText: "this sentence does not appear in the fetched document",
          claimType: "directly_stated",
        },
      ],
    }),
    { fetchImpl: fakeFetch(POLICY_TEXT) }
  );

  assert.equal(result.validatedRuleCount, 0);
  assert.equal(result.rejectedRuleCount, 1);
});

test("resolveCase: sources array reports live-acquisition provenance (finalUrl, hashes, extractor) for the returned case", async () => {
  const result = await resolveCase(input(), { fetchImpl: fakeFetch(POLICY_TEXT) });
  const source = result.sources[0]!;

  assert.ok(source.contentHash.startsWith("sha256:"));
  assert.ok(source.rawBytesHash.startsWith("sha256:"));
  assert.deepEqual(source.extractor, { name: "identity", version: "1" });
});
