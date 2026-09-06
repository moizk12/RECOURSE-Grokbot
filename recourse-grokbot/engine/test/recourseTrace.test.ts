import test from "node:test";
import assert from "node:assert/strict";
import { analyzeCase, type AnalyzeCaseInput } from "../src/cli/analyzeCase.ts";
import { buildRecourseTrace, renderRecourseTraceMarkdown, traceContentHash } from "../src/trace/recourseTrace.ts";
import type { PolicySource } from "../src/types/authority.ts";
import type { CaseEvent } from "../src/types/case.ts";

/**
 * Structural tests for the Recourse Trace.
 *
 * The point of these is narrow and deliberate: critical evidence must not be
 * able to silently disappear from the artifact. Each test names one class of
 * evidence a reviewer would need and asserts it survives into both the JSON
 * and the Markdown. A trace that quietly dropped its rejected claims, its
 * source hashes, or its uncertainty section would still "work" -- these are
 * what make that a test failure instead.
 */

const SOURCE_TEXT = [
  "EXAMPLE UNIVERSITY GRIEVANCE PROCEDURE",
  "A student must file a written grievance within 10 calendar days of receiving the decision notice.",
  "The hearing officer shall send written notice of the hearing to the student no less than 5 business days prior to the hearing.",
  "The dean may consult with the provost before issuing a decision.",
].join("\n");

const OTHER_TEXT = "OTHER UNIVERSITY: A student must appeal within 2 calendar days.";

const URL = "https://example.edu/grievance";
const OTHER_URL = "https://other.example.edu/appeals";

const FETCH = (async (url: string | URL | Request) => {
  const body = String(url) === URL ? SOURCE_TEXT : String(url) === OTHER_URL ? OTHER_TEXT : undefined;
  if (body === undefined) return new Response("not found", { status: 404 });
  return new Response(body, { status: 200, headers: { "content-type": "text/plain" } });
}) as unknown as typeof fetch;

const campus: PolicySource = {
  sourceId: "campus",
  institution: "Example University",
  authorityLevel: "campus_wide",
  scope: { institution: "Example University", decisionTypes: ["academic_grievance"] },
  effective: { effectiveDate: "2024-08-01", versionId: "2024.1" },
};

const EVENTS: CaseEvent[] = [
  { eventId: "e1", type: "decision_notice_received", occurredAt: "2026-03-02T09:00:00Z", detail: {} },
  { eventId: "e2", type: "hearing_notice_sent", occurredAt: "2026-03-20T09:00:00Z", detail: {} },
  { eventId: "e3", type: "hearing_held", occurredAt: "2026-03-23T09:00:00Z", detail: {} },
];

function input(overrides: Partial<AnalyzeCaseInput> = {}): AnalyzeCaseInput {
  return {
    caseId: "trace-case-1",
    evaluationAt: "2026-03-25T00:00:00Z",
    dataMarker: "synthetic",
    sourcesToAcquire: [
      { sourceId: "campus", requestedUrl: URL },
      { sourceId: "other", requestedUrl: OTHER_URL },
    ],
    policySources: [campus],
    authorityQuery: { institution: "Example University", decisionType: "academic_grievance" },
    rawProposals: [
      {
        rule: {
          id: "student-file",
          policyId: "example-grievance",
          kind: "obligation",
          provenance: {
            sourceUrl: URL,
            retrievedAt: "2026-03-25T00:00:00Z",
            sourceSpan: "within 10 calendar days",
            actor: "student",
          },
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
      {
        // Advisory: MAY. Validated, but must never gate state.
        rule: {
          id: "dean-consult",
          policyId: "example-grievance",
          kind: "obligation",
          provenance: {
            sourceUrl: URL,
            retrievedAt: "2026-03-25T00:00:00Z",
            sourceSpan: "may consult with the provost",
            actor: "dean",
          },
          actor: "dean",
          action: "consult_provost",
          trigger: null,
          conditions: [],
          deonticForce: "MAY",
        },
        sourceId: "campus",
        quotedText: "The dean may consult with the provost before issuing a decision.",
        claimType: "directly_stated",
      },
      {
        // Rejected: accurate quote, wrong (unresolved) source.
        rule: {
          id: "wrong-source-rule",
          policyId: "other",
          kind: "obligation",
          provenance: {
            sourceUrl: OTHER_URL,
            retrievedAt: "2026-03-25T00:00:00Z",
            sourceSpan: "within 2 calendar days",
            actor: "student",
          },
          actor: "student",
          action: "file_appeal",
          trigger: { eventType: "decision_notice_received" },
          conditions: [],
          deonticForce: "MUST",
        },
        sourceId: "other",
        quotedText: "A student must appeal within 2 calendar days.",
        claimType: "directly_stated",
      },
    ],
    rawConformanceRules: [
      {
        rule: {
          id: "notice-lead-time",
          sourceId: "campus",
          actor: "institution",
          constraint: {
            kind: "minimum_lead_time",
            anchorEventType: "hearing_notice_sent",
            targetEventType: "hearing_held",
            minimum: { amount: 5, unit: "business_day" },
          },
        },
        quotedText:
          "The hearing officer shall send written notice of the hearing to the student no less than 5 business days prior to the hearing.",
        claimType: "directly_stated",
      },
    ],
    events: EVENTS,
    forecast: [{ id: "no-action", kind: "NO_NEW_EVENTS", evaluationAt: "2026-04-15T00:00:00Z", assumptions: ["no party acts"] }],
    ...overrides,
  };
}

async function buildTrace(overrides: Partial<AnalyzeCaseInput> = {}) {
  const analysis = await analyzeCase(input(overrides), { fetchImpl: FETCH });
  return buildRecourseTrace(analysis);
}

test("trace records the case identity and the explicit evaluation instant", async () => {
  const trace = await buildTrace();
  assert.equal(trace.case.caseId, "trace-case-1");
  assert.equal(trace.case.evaluationAt, "2026-03-25T00:00:00Z");
  assert.equal(trace.case.dataMarker, "synthetic");
});

test("trace records governing authority, its reason, and the declared scope/effective metadata", async () => {
  const trace = await buildTrace();
  assert.equal(trace.authority.status, "APPLICABLE");
  assert.equal(trace.authority.governingSourceId, "campus");
  assert.ok(trace.authority.reason.length > 0);
  assert.equal(trace.authority.declaredSources[0]?.effective.effectiveDate, "2024-08-01");
  assert.equal(trace.authority.declaredSources[0]?.effective.versionId, "2024.1");
  assert.equal(trace.authority.declaredSources[0]?.authorityLevel, "campus_wide");
});

test("trace records, for every source, the final URL, retrieval time, both hashes, and the extractor", async () => {
  const trace = await buildTrace();
  assert.equal(trace.sources.length, 2);
  for (const s of trace.sources) {
    assert.ok(s.finalUrl.startsWith("https://"));
    assert.ok(s.retrievedAt.length > 0);
    assert.match(s.rawBytesHash, /^sha256:[0-9a-f]{64}$/);
    assert.match(s.contentHash, /^sha256:[0-9a-f]{64}$/);
    assert.ok(s.extractor.name.length > 0);
    assert.ok(s.extractor.version.length > 0);
  }
});

test("trace carries the exact warrant span for every consequential rule, not just a paraphrase", async () => {
  const trace = await buildTrace();

  const ruleClaim = trace.validation.validatedClaims.find((c) => c.claimId === "student-file");
  assert.ok(ruleClaim, "the validated policy rule must appear as a validated claim");
  assert.equal(ruleClaim.kind, "policy_rule");
  assert.equal(ruleClaim.claimType, "directly_stated");
  assert.match(ruleClaim.quotedText, /within 10 calendar days/);
  assert.ok(ruleClaim.span.end > ruleClaim.span.start);
  assert.match(ruleClaim.contentHash, /^sha256:/);

  const conformanceClaim = trace.validation.validatedClaims.find((c) => c.claimId === "notice-lead-time");
  assert.ok(conformanceClaim);
  assert.equal(conformanceClaim.kind, "conformance_rule");
  assert.match(conformanceClaim.quotedText, /no less than 5 business days/);
});

test("a refused claim survives into the trace with its reason -- rejections are evidence, not noise", async () => {
  const trace = await buildTrace();
  const rejected = trace.validation.rejectedClaims.find((c) => c.claimId === "wrong-source-rule");
  assert.ok(rejected, "the rejected rule must be recorded, not dropped");
  assert.match(rejected.reason, /authority-resolved governing\/supporting set/);
  assert.ok(trace.uncertainty.some((u) => u.kind === "REJECTED_CLAIM" && u.detail.includes("wrong-source-rule")));
});

test("advisory rules are recorded separately and never appear as obligations", async () => {
  const trace = await buildTrace();
  assert.ok(trace.procedure.advisoryRules.some((r) => r.id === "dean-consult"));
  assert.ok(!trace.procedure.obligations.some((o) => o.obligationId === "dean-consult"));
});

test("every conformance finding carries actor, expectation, observed events, status, calculation, and warrant", async () => {
  const trace = await buildTrace();
  assert.equal(trace.conformance.length, 1);
  const finding = trace.conformance[0]!;

  assert.equal(finding.ruleId, "notice-lead-time");
  assert.equal(finding.actor, "institution");
  assert.match(finding.expected, /at least 5 business_day/);
  assert.deepEqual(
    finding.observedEvents.map((e) => e.eventId).sort(),
    ["e2", "e3"]
  );
  assert.equal(finding.status, "NONCONFORMANT");
  // The calculation must contain the engine's own computed boundary date.
  assert.match(finding.calculation, /2026-03-27/);
  assert.match(finding.warrant.quotedText, /no less than 5 business days/);
});

test("the observed case record is present, append-only, and complete", async () => {
  const trace = await buildTrace();
  assert.equal(trace.observedCase.appendOnly, true);
  assert.deepEqual(
    trace.observedCase.events.map((e) => e.eventId),
    ["e1", "e2", "e3"]
  );
});

test("forecast scenarios appear with their assumptions and stated future evaluation instant", async () => {
  const trace = await buildTrace();
  assert.equal(trace.forecast.length, 1);
  const point = trace.forecast[0]!;
  assert.equal(point.status, "evaluated");
  if (point.status !== "evaluated") return;
  assert.equal(point.evaluationAt, "2026-04-15T00:00:00Z");
  assert.deepEqual([...point.assumptions], ["no party acts"]);
  assert.deepEqual([...point.hypotheticalEventIds], []);
});

test("unresolved authority is reported as uncertainty rather than as an empty result", async () => {
  const trace = await buildTrace({
    policySources: [campus, { ...campus, sourceId: "rival" }],
  });
  assert.equal(trace.authority.status, "BLOCKED_SOURCE_CONFLICT");
  assert.ok(trace.uncertainty.some((u) => u.kind === "UNRESOLVED_AUTHORITY"));
  assert.ok(trace.authority.candidateSourceIds.length >= 2);
});

test("the boundary statement is always present and disclaims remedy/guilt/outcome inference", async () => {
  const trace = await buildTrace();
  assert.match(trace.boundary, /does not infer a remedy/);
  assert.match(trace.boundary, /guilt, innocence/);
  assert.match(trace.boundary, /not legal advice/);
});

test("the trace hash is deterministic, and changes when the trace content changes", async () => {
  const a = await buildTrace();
  const b = await buildTrace();

  // Retrieval timestamps come from a real acquisition clock, so compare the
  // hash of everything else -- the point is that identical content hashes
  // identically and different content does not.
  const { traceHash: _h1, sources: _s1, ...aRest } = a;
  const { traceHash: _h2, sources: _s2, ...bRest } = b;
  assert.equal(traceContentHash(aRest as never), traceContentHash(bRest as never));

  const different = { ...aRest, case: { ...a.case, evaluationAt: "2026-05-01T00:00:00Z" } };
  assert.notEqual(traceContentHash(aRest as never), traceContentHash(different as never));

  assert.match(a.traceHash, /^sha256:[0-9a-f]{64}$/);
});

test("the trace hash is insensitive to key order but sensitive to array order", async () => {
  const trace = await buildTrace();
  const { traceHash: _drop, ...rest } = trace;
  const reordered = {
    boundary: rest.boundary,
    uncertainty: rest.uncertainty,
    forecast: rest.forecast,
    conformance: rest.conformance,
    observedCase: rest.observedCase,
    procedure: rest.procedure,
    validation: rest.validation,
    sources: rest.sources,
    authority: rest.authority,
    case: rest.case,
    traceVersion: rest.traceVersion,
  };
  assert.equal(traceContentHash(rest as never), traceContentHash(reordered as never));

  const eventsReversed = {
    ...rest,
    observedCase: { ...rest.observedCase, events: [...rest.observedCase.events].reverse() },
  };
  assert.notEqual(traceContentHash(rest as never), traceContentHash(eventsReversed as never));
});

test("the Markdown rendering carries the evidence a reviewer needs, without engine jargon", async () => {
  const trace = await buildTrace();
  const md = renderRecourseTraceMarkdown(trace);

  // Identity and provenance
  assert.match(md, /# Recourse Trace — trace-case-1/);
  assert.match(md, /Case evaluated as of:\*\* 2026-03-25T00:00:00Z/);
  assert.match(md, /Trace hash/);
  assert.match(md, /Raw document hash/);
  assert.match(md, /Canonical text hash/);

  // Authority, with its reason
  assert.match(md, /## Governing procedure/);
  assert.match(md, /## Governing authority, in full/);
  assert.match(md, /APPLICABLE/);

  // The quoted evidence itself, not just rule ids
  assert.match(md, /A student must file a written grievance within 10 calendar days/);
  assert.match(md, /no less than 5 business days prior to the hearing/);

  // Refusals are as visible as findings
  assert.match(md, /### Refused/);
  assert.match(md, /wrong-source-rule/);

  // Findings, observed record, forecast, uncertainty, boundary
  assert.match(md, /## Findings/);
  assert.match(md, /\*\*NONCONFORMANT\*\*/);
  assert.match(md, /## The case record \(append-only\)/);
  assert.match(md, /## Forecast/);
  assert.match(md, /## What Recourse could not determine/);
  assert.match(md, /## What this record does not claim/);
  assert.match(md, /does not infer a remedy/);
  assert.match(md, /No remedy or outcome is inferred here/);
});

test("the human summary comes before the technical evidence, and the evidence is still all there", async () => {
  const trace = await buildTrace();
  const md = renderRecourseTraceMarkdown(trace);

  const at = (needle: string) => {
    const i = md.indexOf(needle);
    assert.notEqual(i, -1, `expected the rendering to contain "${needle}"`);
    return i;
  };

  // A student or a panel member reads top-down. The finding, both parties'
  // deadlines, the limits of the record and the "not inferred" statement must
  // all be readable before the first content hash, or in practice they are
  // not read at all.
  const evidenceDivider = at("# Evidence and working");
  for (const summarySection of [
    "## Governing procedure",
    "## Findings",
    "## Deadlines, on both sides",
    "## What Recourse could not determine",
    "## What this record does not claim",
  ]) {
    assert.ok(at(summarySection) < evidenceDivider, `${summarySection} must appear above the evidence divider`);
  }

  // Moved, not dropped: every technical section is still present, below.
  for (const detailSection of [
    "## Sources as captured",
    "## What was validated, and what was refused",
    "## Findings — full computation and warrants",
    "## Obligations — full detail",
    "## Trace integrity",
  ]) {
    assert.ok(at(detailSection) > evidenceDivider, `${detailSection} must appear below the evidence divider`);
  }

  // The lead must not be buried by hashes.
  assert.ok(at("sha256:") > at("## Findings"), "no content hash may appear before the first finding");
});

test("the trace-hash statement does not overclaim: content-addressed for a captured analysis, not stable across live recaptures", async () => {
  const md = renderRecourseTraceMarkdown(await buildTrace());
  assert.match(md, /content-addressed over this captured analysis/);
  assert.match(md, /not a fingerprint of the live web pages/);
});

test("the Markdown of a blocked-authority case says so, rather than rendering an empty procedure", async () => {
  const trace = await buildTrace({ policySources: [campus, { ...campus, sourceId: "rival" }] });
  const md = renderRecourseTraceMarkdown(trace);
  assert.match(md, /BLOCKED_SOURCE_CONFLICT/);
  assert.match(md, /_No binding obligations were validated._/);
  assert.match(md, /UNRESOLVED_AUTHORITY/);
});
