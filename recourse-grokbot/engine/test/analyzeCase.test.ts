import test from "node:test";
import assert from "node:assert/strict";
import { analyzeCase, type AnalyzeCaseInput } from "../src/cli/analyzeCase.ts";
import type { PolicySource } from "../src/types/authority.ts";
import type { CaseEvent } from "../src/types/case.ts";

/**
 * End-to-end tests for the full production chain (cli/analyzeCase.ts):
 * acquisition -> lineage proposal -> lineage warrant -> authority resolution
 * -> policy proposal -> authority gate -> rule warrant -> Procedure Model ->
 * Case Twin -> deadlines -> conformance proposal -> authority gate ->
 * conformance warrant -> conformance check -> deviations.
 *
 * The load-bearing property under test throughout is NOT "does the pipeline
 * run" -- it is that a perfectly accurate quotation from a source authority
 * resolution did not select can never produce an executable conclusion.
 */

const CAMPUS_TEXT = [
  "GRIEVANCE PROCEDURES (CAMPUS-WIDE)",
  "A student must file a written grievance within 10 calendar days of receiving the decision notice.",
  "The unit head shall respond in writing within 15 calendar days of receiving the grievance.",
  "The hearing officer shall send written notice of the hearing to the student no less than 5 business days prior to the hearing.",
].join("\n");

const COLLEGE_TEXT = [
  "COLLEGE OF ENGINEERING GRIEVANCE SUPPLEMENT",
  "This supplement implements the campus-wide Grievance Procedures and adds college-specific detail.",
  "The college grievance officer shall acknowledge receipt within 3 business days.",
].join("\n");

/** A wholly separate institution's policy that happens to contain quotable procedural text. */
const UNRELATED_TEXT = [
  "OTHER UNIVERSITY STUDENT APPEALS POLICY",
  "A student must file a written appeal within 2 calendar days of the decision.",
].join("\n");

function fakeFetch(byUrl: Record<string, string>): typeof fetch {
  return (async (url: string | URL | Request) => {
    const key = String(url);
    const body = byUrl[key];
    if (body === undefined) {
      return new Response("not found", { status: 404 });
    }
    return new Response(body, {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
  }) as unknown as typeof fetch;
}

const CAMPUS_URL = "https://example.edu/grievance";
const COLLEGE_URL = "https://engineering.example.edu/grievance-supplement";
const OTHER_URL = "https://other.example.edu/appeals";

const FETCH = fakeFetch({ [CAMPUS_URL]: CAMPUS_TEXT, [COLLEGE_URL]: COLLEGE_TEXT, [OTHER_URL]: UNRELATED_TEXT });

const campusSource: PolicySource = {
  sourceId: "campus",
  institution: "Example University",
  authorityLevel: "campus_wide",
  scope: { institution: "Example University", decisionTypes: ["academic_grievance"] },
  effective: { effectiveDate: "2024-08-01" },
};

const collegeSource: PolicySource = {
  sourceId: "college",
  institution: "Example University",
  authorityLevel: "college_level",
  scope: { institution: "Example University", decisionTypes: ["academic_grievance"] },
  effective: { effectiveDate: "2024-08-01" },
};

const EVENTS: CaseEvent[] = [
  { eventId: "e1", type: "case_opened", occurredAt: "2026-03-02T09:00:00Z", detail: {} },
  { eventId: "e2", type: "decision_notice_received", occurredAt: "2026-03-02T09:00:00Z", detail: {} },
  { eventId: "e3", type: "grievance_filed", occurredAt: "2026-03-05T09:00:00Z", detail: {} },
  { eventId: "e4", type: "hearing_notice_sent", occurredAt: "2026-03-20T09:00:00Z", detail: {} },
  { eventId: "e5", type: "hearing_held", occurredAt: "2026-03-23T09:00:00Z", detail: {} },
];

function baseInput(overrides: Partial<AnalyzeCaseInput> = {}): AnalyzeCaseInput {
  return {
    caseId: "case-e2e-1",
    evaluationAt: "2026-03-25T00:00:00Z",
    dataMarker: "synthetic",
    sourcesToAcquire: [
      { sourceId: "campus", requestedUrl: CAMPUS_URL },
      { sourceId: "college", requestedUrl: COLLEGE_URL },
    ],
    policySources: [campusSource, collegeSource],
    authorityQuery: { institution: "Example University", decisionType: "academic_grievance" },
    rawRelationships: [
      {
        relationship: { id: "rel-1", type: "IMPLEMENTS", fromSourceId: "college", toSourceId: "campus" },
        quotedText: "This supplement implements the campus-wide Grievance Procedures",
        claimType: "directly_stated",
      },
    ],
    rawProposals: [
      {
        rule: {
          id: "student-file",
          policyId: "example-grievance",
          kind: "obligation",
          provenance: {
            sourceUrl: CAMPUS_URL,
            retrievedAt: "2026-03-25T00:00:00Z",
            sourceSpan: "A student must file a written grievance within 10 calendar days",
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
        rule: {
          id: "unit-respond",
          policyId: "example-grievance",
          kind: "obligation",
          provenance: {
            sourceUrl: CAMPUS_URL,
            retrievedAt: "2026-03-25T00:00:00Z",
            sourceSpan: "The unit head shall respond in writing within 15 calendar days",
            actor: "institution",
          },
          actor: "institution",
          action: "respond_to_grievance",
          trigger: { eventType: "grievance_filed" },
          conditions: [],
          deonticForce: "SHALL",
          deadline: { type: "relative", amount: 15, unit: "calendar_day", fromEvent: "grievance_filed" },
        },
        sourceId: "campus",
        quotedText: "The unit head shall respond in writing within 15 calendar days of receiving the grievance.",
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
    ...overrides,
  };
}

test("full chain: acquisition -> lineage -> authority -> rules -> Case Twin -> conformance, end to end", async () => {
  const result = await analyzeCase(baseInput(), { fetchImpl: FETCH });

  // Sources were actually captured and hashed by the engine, not asserted by the caller.
  assert.equal(result.sources.length, 2);
  for (const s of result.sources) {
    assert.match(s.rawBytesHash, /^sha256:[0-9a-f]{64}$/);
    assert.match(s.contentHash, /^sha256:[0-9a-f]{64}$/);
  }

  // Lineage was validated from quoted text, and authority resolved to the campus policy.
  assert.equal(result.relationships.validated.length, 1);
  assert.equal(result.authority.status, "APPLICABLE");
  assert.equal(result.authority.status === "APPLICABLE" && result.authority.governingSourceId, "campus");
  assert.deepEqual(result.authority.status === "APPLICABLE" ? [...result.authority.supportingSourceIds] : [], [
    "college",
  ]);

  // Both policy rules compiled; deadlines were computed by the engine.
  assert.equal(result.rules.validated.length, 2);
  const student = result.caseState.obligations.find((o) => o.obligationId === "student-file");
  const institution = result.caseState.obligations.find((o) => o.obligationId === "unit-respond");
  assert.equal(student?.dueAt, "2026-03-12"); // 2026-03-02 + 10 calendar days
  assert.equal(institution?.dueAt, "2026-03-20"); // 2026-03-05 + 15 calendar days

  // Conformance: notice sent 2026-03-20 (Fri), hearing held 2026-03-23 (Mon) --
  // only 1 business day, well short of the required 5.
  assert.equal(result.conformanceRules.validated.length, 1);
  assert.equal(result.conformance.length, 1);
  assert.equal(result.conformance[0]?.status, "NONCONFORMANT");

  assert.equal(result.dataMarker, "synthetic");
});

test("WRONG SOURCE: a perfectly accurate quote from a source outside the resolved set never becomes an executable rule", async () => {
  const input = baseInput({
    sourcesToAcquire: [
      { sourceId: "campus", requestedUrl: CAMPUS_URL },
      { sourceId: "college", requestedUrl: COLLEGE_URL },
      { sourceId: "other", requestedUrl: OTHER_URL },
    ],
    rawProposals: [
      {
        rule: {
          id: "wrong-source-rule",
          policyId: "other-appeals",
          kind: "obligation",
          provenance: {
            sourceUrl: OTHER_URL,
            retrievedAt: "2026-03-25T00:00:00Z",
            sourceSpan: "A student must file a written appeal within 2 calendar days of the decision.",
            actor: "student",
          },
          actor: "student",
          action: "file_appeal",
          trigger: { eventType: "decision_notice_received" },
          conditions: [],
          deonticForce: "MUST",
          deadline: { type: "relative", amount: 2, unit: "calendar_day", fromEvent: "decision_notice_received" },
        },
        // This quote IS verbatim present in the "other" source. Warrant
        // validation alone would happily accept it.
        sourceId: "other",
        quotedText: "A student must file a written appeal within 2 calendar days of the decision.",
        claimType: "directly_stated",
      },
    ],
    rawConformanceRules: [],
  });

  const result = await analyzeCase(input, { fetchImpl: FETCH });

  assert.equal(result.authority.status, "APPLICABLE");
  assert.equal(result.rules.validated.length, 0);
  assert.equal(result.rules.rejected.length, 1);
  assert.match(
    JSON.stringify(result.rules.rejected),
    /not part of the authority-resolved governing\/supporting set/
  );
  // and no obligation, and therefore no deadline, was produced from it
  assert.equal(result.caseState.obligations.length, 0);
});

test("WRONG SOURCE: the same gate applies to conformance rules", async () => {
  const input = baseInput({
    sourcesToAcquire: [
      { sourceId: "campus", requestedUrl: CAMPUS_URL },
      { sourceId: "college", requestedUrl: COLLEGE_URL },
      { sourceId: "other", requestedUrl: OTHER_URL },
    ],
    rawProposals: [],
    rawConformanceRules: [
      {
        rule: {
          id: "from-wrong-source",
          sourceId: "other",
          actor: "institution",
          constraint: {
            kind: "minimum_lead_time",
            anchorEventType: "hearing_notice_sent",
            targetEventType: "hearing_held",
            minimum: { amount: 5, unit: "business_day" },
          },
        },
        quotedText: "A student must file a written appeal within 2 calendar days of the decision.",
        claimType: "directly_stated",
      },
    ],
  });

  const result = await analyzeCase(input, { fetchImpl: FETCH });
  assert.equal(result.conformanceRules.validated.length, 0);
  assert.equal(result.conformance.length, 0);
  assert.match(JSON.stringify(result.conformanceRules.rejected), /authority-resolved governing\/supporting set/);
});

test("unresolved authority blocks the entire executable layer, however well warranted the text is", async () => {
  // No lineage relationship at all between two scope-matching sources.
  const input = baseInput({ rawRelationships: [] });

  const result = await analyzeCase(input, { fetchImpl: FETCH });

  assert.equal(result.authority.status, "BLOCKED_SOURCE_CONFLICT");
  assert.equal(result.rules.validated.length, 0);
  assert.equal(result.conformanceRules.validated.length, 0);
  assert.equal(result.conformance.length, 0);
  assert.equal(result.caseState.obligations.length, 0);
  assert.match(JSON.stringify(result.rules.rejected), /authority for this scope is not resolved/);
});

test("a fabricated lineage quote is rejected, and authority resolution then refuses to pick a governing source", async () => {
  const input = baseInput({
    rawRelationships: [
      {
        relationship: { id: "rel-fake", type: "IMPLEMENTS", fromSourceId: "college", toSourceId: "campus" },
        quotedText: "This supplement is subordinate to and implements the campus-wide policy in all respects",
        claimType: "directly_stated",
      },
    ],
  });

  const result = await analyzeCase(input, { fetchImpl: FETCH });

  assert.equal(result.relationships.validated.length, 0);
  assert.equal(result.relationships.rejected.length, 1);
  assert.match(JSON.stringify(result.relationships.rejected), /not found verbatim/);
  assert.equal(result.authority.status, "BLOCKED_SOURCE_CONFLICT");
  assert.equal(result.rules.validated.length, 0);
});

test("an inferred lineage claim is held for review and never silently establishes precedence", async () => {
  const input = baseInput({
    rawRelationships: [
      {
        relationship: { id: "rel-inferred", type: "IMPLEMENTS", fromSourceId: "college", toSourceId: "campus" },
        quotedText: "COLLEGE OF ENGINEERING GRIEVANCE SUPPLEMENT",
        claimType: "inferred",
      },
    ],
  });

  const result = await analyzeCase(input, { fetchImpl: FETCH });

  assert.equal(result.relationships.validated.length, 0);
  assert.equal(result.relationships.needsReview.length, 1);
  assert.equal(result.authority.status, "BLOCKED_SOURCE_CONFLICT");
});

test("evaluationAt is explicit: the same case at an earlier instant reports pending, not missed", async () => {
  const early = await analyzeCase(baseInput({ evaluationAt: "2026-03-10T00:00:00Z" }), { fetchImpl: FETCH });
  const late = await analyzeCase(baseInput({ evaluationAt: "2026-03-25T00:00:00Z" }), { fetchImpl: FETCH });

  const earlyStudent = early.caseState.obligations.find((o) => o.obligationId === "student-file");
  const lateStudent = late.caseState.obligations.find((o) => o.obligationId === "student-file");

  assert.equal(earlyStudent?.status, "pending");
  assert.equal(lateStudent?.status, "missed");
  assert.equal(earlyStudent?.dueAt, lateStudent?.dueAt);
});

test("the authority query's asOf defaults to the caller's evaluationAt, never to wall-clock time", async () => {
  const result = await analyzeCase(baseInput(), { fetchImpl: FETCH });
  assert.equal(result.authorityQuery.asOf, "2026-03-25T00:00:00Z");

  const explicit = await analyzeCase(
    baseInput({
      authorityQuery: {
        institution: "Example University",
        decisionType: "academic_grievance",
        asOf: "2026-01-01T00:00:00Z",
      },
    }),
    { fetchImpl: FETCH }
  );
  assert.equal(explicit.authorityQuery.asOf, "2026-01-01T00:00:00Z");
});
