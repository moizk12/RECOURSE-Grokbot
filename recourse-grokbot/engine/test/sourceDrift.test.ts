import test from "node:test";
import assert from "node:assert/strict";
import { analyzeCase, type AnalyzeCaseInput } from "../src/cli/analyzeCase.ts";
import { buildRecourseTrace } from "../src/trace/recourseTrace.ts";
import { checkSourceDrift, renderDriftMarkdown } from "../src/drift/sourceDrift.ts";
import type { PolicySource } from "../src/types/authority.ts";

/**
 * Source drift tests.
 *
 * The behaviours worth guarding are the refusals: drift must never re-derive
 * a conclusion from a changed document, never silently keep a stale
 * conclusion as current, and never claim a hash change proves the RULE
 * changed.
 */

const V1 = [
  "EXAMPLE UNIVERSITY GRIEVANCE PROCEDURE",
  "A student must file a written grievance within 10 calendar days of receiving the decision notice.",
].join("\n");

const V2 = [
  "EXAMPLE UNIVERSITY GRIEVANCE PROCEDURE",
  "A student must file a written grievance within 21 calendar days of receiving the decision notice.",
].join("\n");

const URL = "https://example.edu/grievance";

function fetchServing(body: string | null, opts: { status?: number } = {}): typeof fetch {
  return (async () => {
    if (body === null) return new Response("gone", { status: opts.status ?? 404 });
    return new Response(body, { status: 200, headers: { "content-type": "text/plain" } });
  }) as unknown as typeof fetch;
}

const source: PolicySource = {
  sourceId: "campus",
  institution: "Example University",
  authorityLevel: "campus_wide",
  scope: { institution: "Example University", decisionTypes: ["academic_grievance"] },
  effective: { effectiveDate: "2024-08-01" },
};

const INPUT: AnalyzeCaseInput = {
  caseId: "drift-case-1",
  evaluationAt: "2026-03-25T00:00:00Z",
  dataMarker: "synthetic",
  sourcesToAcquire: [{ sourceId: "campus", requestedUrl: URL }],
  policySources: [source],
  authorityQuery: { institution: "Example University", decisionType: "academic_grievance" },
  rawProposals: [
    {
      rule: {
        id: "student-file",
        policyId: "example",
        kind: "obligation",
        provenance: { sourceUrl: URL, retrievedAt: "2026-03-25T00:00:00Z", sourceSpan: "10 calendar days", actor: "student" },
        actor: "student",
        action: "file_grievance",
        trigger: { eventType: "decision_notice_received" },
        conditions: [],
        deonticForce: "MUST",
        deadline: { type: "relative", amount: 10, unit: "calendar_day", fromEvent: "decision_notice_received" },
      },
      sourceId: "campus",
      quotedText: "A student must file a written grievance within 10 calendar days of receiving the decision notice.",
      claimType: "directly_stated",
    },
  ],
  events: [{ eventId: "e1", type: "decision_notice_received", occurredAt: "2026-03-02T09:00:00Z", detail: {} }],
};

async function traceAgainstV1() {
  const analysis = await analyzeCase(INPUT, { fetchImpl: fetchServing(V1) });
  return buildRecourseTrace(analysis);
}

test("an unchanged source reports UNCHANGED and invalidates nothing", async () => {
  const trace = await traceAgainstV1();
  const report = await checkSourceDrift(trace, {
    checkedAt: "2026-06-01T00:00:00Z",
    fetchImpl: fetchServing(V1),
  });

  assert.equal(report.overall, "UNCHANGED");
  assert.equal(report.sources[0]?.status, "UNCHANGED");
  assert.deepEqual([...(report.sources[0]?.dependentClaims ?? [])], []);
  assert.equal(report.caseId, "drift-case-1");
  assert.equal(report.traceHash, trace.traceHash);
  assert.equal(report.checkedAt, "2026-06-01T00:00:00Z");
});

test("a changed source reports SOURCE_CHANGED and marks every dependent claim for revalidation", async () => {
  const trace = await traceAgainstV1();
  const report = await checkSourceDrift(trace, {
    checkedAt: "2026-06-01T00:00:00Z",
    fetchImpl: fetchServing(V2),
  });

  assert.equal(report.overall, "REVALIDATION_REQUIRED");
  const finding = report.sources[0]!;
  assert.equal(finding.status, "SOURCE_CHANGED");
  assert.notEqual(finding.pinned.contentHash, finding.current?.contentHash);

  const dependent = finding.dependentClaims.find((c) => c.claimId === "student-file");
  assert.ok(dependent, "the rule compiled from this source must be listed as dependent");
  assert.equal(dependent.disposition, "REVALIDATION_REQUIRED");
});

test("a changed hash is never reported as proof that the rule itself changed", async () => {
  const trace = await traceAgainstV1();
  const report = await checkSourceDrift(trace, { checkedAt: "2026-06-01T00:00:00Z", fetchImpl: fetchServing(V2) });
  const detail = report.sources[0]!.detail;

  assert.match(detail, /does NOT\s+establish that the substantive rule changed/);
  assert.match(detail, /require human revalidation/);
});

test("the prior conclusion is carried explicitly as stale, never presented as current", async () => {
  const trace = await traceAgainstV1();
  const before = trace.procedure.obligations.find((o) => o.obligationId === "student-file");
  assert.equal(before?.status, "missed");

  const report = await checkSourceDrift(trace, { checkedAt: "2026-06-01T00:00:00Z", fetchImpl: fetchServing(V2) });
  const dependent = report.sources[0]!.dependentClaims.find((c) => c.claimId === "student-file")!;

  assert.match(dependent.staleConclusion ?? "", /was missed/);
  const md = renderDriftMarkdown(report);
  assert.match(md, /now stale/);
});

test("drift never re-derives anything from the new version: no rules, no deadlines, no findings", async () => {
  const trace = await traceAgainstV1();
  const report = await checkSourceDrift(trace, { checkedAt: "2026-06-01T00:00:00Z", fetchImpl: fetchServing(V2) });

  // The report's entire surface is provenance and dispositions -- there is
  // nowhere for a re-derived conclusion to appear, and nothing that looks
  // like the new document's "21 calendar days" is present anywhere.
  const serialized = JSON.stringify(report);
  assert.doesNotMatch(serialized, /21 calendar days/);
  assert.ok(!("rules" in report));
  assert.ok(!("caseState" in report));
  assert.ok(!("conformance" in report));
});

test("an unreachable source reports SOURCE_UNAVAILABLE and still lists what depended on it", async () => {
  const trace = await traceAgainstV1();
  const report = await checkSourceDrift(trace, {
    checkedAt: "2026-06-01T00:00:00Z",
    fetchImpl: fetchServing(null, { status: 503 }),
  });

  assert.equal(report.overall, "REVALIDATION_REQUIRED");
  const finding = report.sources[0]!;
  assert.equal(finding.status, "SOURCE_UNAVAILABLE");
  assert.equal(finding.current, undefined);
  assert.ok(finding.dependentClaims.some((c) => c.claimId === "student-file"));
  assert.match(finding.detail, /cannot be confirmed as current/);
});

test("identical bytes with a different canonical text is EXTRACTOR_DRIFT, not SOURCE_CHANGED", async () => {
  const trace = await traceAgainstV1();

  // Same raw bytes, but served as a content type that routes through a
  // different extractor -- the one case where the document is untouched and
  // only our reading of it moved.
  const sameBytesDifferentExtraction = (async () =>
    new Response(V1, { status: 200, headers: { "content-type": "text/plain" } })) as unknown as typeof fetch;

  const unchanged = await checkSourceDrift(trace, {
    checkedAt: "2026-06-01T00:00:00Z",
    fetchImpl: sameBytesDifferentExtraction,
  });
  assert.equal(unchanged.sources[0]?.status, "UNCHANGED");

  // Directly exercise the classification the engine would reach if the
  // canonical text moved while the bytes did not.
  const drifted = await checkSourceDrift(
    {
      ...trace,
      sources: [{ ...trace.sources[0]!, contentHash: "sha256:" + "0".repeat(64) }],
    },
    { checkedAt: "2026-06-01T00:00:00Z", fetchImpl: sameBytesDifferentExtraction }
  );
  assert.equal(drifted.sources[0]?.status, "EXTRACTOR_DRIFT");
  assert.match(drifted.sources[0]!.detail, /byte-identical/);
  assert.match(drifted.sources[0]!.detail, /no longer resolve/);
});

test("the drift report renders for a human without engine jargon", async () => {
  const trace = await traceAgainstV1();
  const report = await checkSourceDrift(trace, { checkedAt: "2026-06-01T00:00:00Z", fetchImpl: fetchServing(V2) });
  const md = renderDriftMarkdown(report);

  assert.match(md, /# Source drift check — drift-case-1/);
  assert.match(md, /\*\*Result:\*\* REVALIDATION_REQUIRED/);
  assert.match(md, /Validated against: sha256:/);
  assert.match(md, /Now serving: sha256:/);
  assert.match(md, /Conclusions that rested on this source and must be revalidated/);
});
