import test from "node:test";
import assert from "node:assert/strict";
import { validateConformanceRule } from "../src/conformance/conformanceValidator.ts";
import { proposeConformanceRule, proposeConformanceRules } from "../src/conformance/conformancePipeline.ts";
import { checkConformance, checkAllConformance } from "../src/conformance/conformanceChecker.ts";
import { resolveAuthority } from "../src/authority/authorityResolver.ts";
import { captureSource, hashContent, SourceStore } from "../src/warrant/sourceStore.ts";
import { CaseEventLog } from "../src/case/eventLog.ts";
import type { AuthorityResolution } from "../src/authority/authorityResolver.ts";
import type { CandidateConformanceRule, ValidatedConformanceRule } from "../src/types/conformance.ts";
import type { PolicySource } from "../src/types/authority.ts";

// ---------------------------------------------------------------------------
// Case Western Reserve University Formal Hearing Process benchmark.
//
// Captured content below is a representative excerpt tracking the publicly
// published procedure at
// https://case.edu/studentlife/conduct/university-code-conduct/procedures/formal-hearing-process
// (a live fetch of that page was not available from this environment; the
// two requirements quoted are corroborated via search and mirror this
// project's own `verification_status: search_snippet_only` convention used
// throughout benchmarks/ for sources that could not be fetched in full).
// The two requirements under test:
//   1. Hearing notice (date/time/location) at least 5 business days before the hearing.
//   2. Information relevant to the hearing available to the parties before the hearing.
// ---------------------------------------------------------------------------

const CWRU_TEXT =
  "The date, time, and location of the hearing will be communicated to the respondent at least five (5) business days prior to the hearing. " +
  "Information that is relevant to the hearing will be made available for review by the parties in advance of the hearing.";

const NOTICE_SPAN = { start: 0, end: CWRU_TEXT.indexOf("Information that") };
const NOTICE_QUOTE = CWRU_TEXT.slice(NOTICE_SPAN.start, NOTICE_SPAN.end);
const INFO_SPAN = { start: CWRU_TEXT.indexOf("Information that"), end: CWRU_TEXT.length };
const INFO_QUOTE = CWRU_TEXT.slice(INFO_SPAN.start, INFO_SPAN.end);

function cwruStore(): SourceStore {
  return new SourceStore([
    captureSource({
      sourceId: "cwru-formal-hearing",
      requestedUrl: "https://case.edu/studentlife/conduct/university-code-conduct/procedures/formal-hearing-process",
      retrievedAt: "2026-09-01T00:00:00Z",
      content: CWRU_TEXT,
    }),
  ]);
}

const cwruSource: PolicySource = {
  sourceId: "cwru-formal-hearing",
  institution: "Case Western Reserve University",
  authorityLevel: "campus_wide",
  scope: { institution: "Case Western Reserve University", decisionTypes: ["formal_hearing"] },
  effective: { effectiveDate: "2024-08-01" },
};

function cwruAuthority(): AuthorityResolution {
  return resolveAuthority(
    [cwruSource],
    [],
    { institution: "Case Western Reserve University", decisionType: "formal_hearing", asOf: "2026-09-06T00:00:00Z" }
  );
}

function noticeLeadTimeCandidate(): CandidateConformanceRule {
  return {
    id: "cwru-notice-lead-time",
    sourceId: "cwru-formal-hearing",
    actor: "institution",
    constraint: {
      kind: "minimum_lead_time",
      anchorEventType: "hearing_notice_sent",
      targetEventType: "hearing_held",
      minimum: { amount: 5, unit: "business_day" },
    },
    warrant: {
      sourceId: "cwru-formal-hearing",
      contentHash: hashContent(CWRU_TEXT),
      span: NOTICE_SPAN,
      quotedText: NOTICE_QUOTE,
      claimType: "directly_stated",
    },
  };
}

function relevantInfoCandidate(): CandidateConformanceRule {
  return {
    id: "cwru-relevant-info-before-hearing",
    sourceId: "cwru-formal-hearing",
    actor: "institution",
    constraint: {
      kind: "required_before",
      eventType: "relevant_information_disclosed",
      beforeEventType: "hearing_held",
    },
    warrant: {
      sourceId: "cwru-formal-hearing",
      contentHash: hashContent(CWRU_TEXT),
      span: INFO_SPAN,
      quotedText: INFO_QUOTE,
      claimType: "directly_stated",
    },
  };
}

function noticeMustExistCandidate(): CandidateConformanceRule {
  return {
    id: "cwru-notice-must-exist",
    sourceId: "cwru-formal-hearing",
    actor: "institution",
    constraint: { kind: "required_event", eventType: "hearing_notice_sent", closesUponEventType: "hearing_held" },
    warrant: {
      sourceId: "cwru-formal-hearing",
      contentHash: hashContent(CWRU_TEXT),
      span: NOTICE_SPAN,
      quotedText: NOTICE_QUOTE,
      claimType: "directly_stated",
    },
  };
}

function promote(candidate: CandidateConformanceRule, authority: AuthorityResolution = cwruAuthority()): ValidatedConformanceRule {
  const outcome = proposeConformanceRule(candidate, cwruStore(), authority);
  assert.equal(outcome.status, "auto_promotable", "test setup expected a valid, authority-cleared rule");
  if (outcome.status !== "auto_promotable") throw new Error("unreachable");
  return outcome.rule;
}

// ---- conformanceValidator: structural + warrant checks ----

test("a candidate missing actor is rejected", () => {
  const outcome = validateConformanceRule({ ...noticeLeadTimeCandidate(), actor: undefined }, cwruStore());
  assert.equal(outcome.status, "rejected");
  if (outcome.status === "rejected") assert.ok(outcome.errors.some((e) => e.field === "actor"));
});

test("a minimum_lead_time constraint with a non-positive amount is rejected", () => {
  const candidate = noticeLeadTimeCandidate();
  const outcome = validateConformanceRule(
    {
      ...candidate,
      constraint: {
        kind: "minimum_lead_time",
        anchorEventType: "hearing_notice_sent",
        targetEventType: "hearing_held",
        minimum: { amount: 0, unit: "business_day" },
      },
    },
    cwruStore()
  );
  assert.equal(outcome.status, "rejected");
  if (outcome.status === "rejected") assert.ok(outcome.errors.some((e) => e.field === "constraint.minimum.amount"));
});

test("a required_before constraint whose eventType equals beforeEventType is rejected as ambiguous", () => {
  const candidate = relevantInfoCandidate();
  const outcome = validateConformanceRule(
    { ...candidate, constraint: { kind: "required_before", eventType: "hearing_held", beforeEventType: "hearing_held" } },
    cwruStore()
  );
  assert.equal(outcome.status, "rejected");
  if (outcome.status === "rejected") assert.ok(outcome.errors.some((e) => e.field === "constraint.beforeEventType"));
});

test("a fabricated quote is rejected even when the rest of the rule is well-formed", () => {
  const candidate = noticeLeadTimeCandidate();
  const outcome = validateConformanceRule(
    { ...candidate, warrant: { ...candidate.warrant!, quotedText: "Notice may be given at any time, with no minimum lead time." } },
    cwruStore()
  );
  assert.equal(outcome.status, "rejected");
  if (outcome.status === "rejected") assert.ok(outcome.errors.some((e) => e.field === "warrant.quotedText"));
});

test("an inferred conformance claim fails into review, never auto-promoted", () => {
  const candidate = noticeLeadTimeCandidate();
  const outcome = validateConformanceRule({ ...candidate, warrant: { ...candidate.warrant!, claimType: "inferred" } }, cwruStore());
  assert.equal(outcome.status, "needs_review");
});

test("a correctly warranted, directly-stated conformance rule is auto-promotable", () => {
  const outcome = validateConformanceRule(noticeLeadTimeCandidate(), cwruStore());
  assert.equal(outcome.status, "auto_promotable");
});

// ---- authority -> conformance integration ----

test("a conformance rule cannot be produced when authority resolution is BLOCKED_SOURCE_CONFLICT", () => {
  const conflicted: AuthorityResolution = {
    status: "BLOCKED_SOURCE_CONFLICT",
    candidateSourceIds: ["cwru-formal-hearing", "some-other-source"],
    reason: "test: unresolved competing sources",
  };
  const outcome = proposeConformanceRule(noticeLeadTimeCandidate(), cwruStore(), conflicted);
  assert.equal(outcome.status, "rejected");
  if (outcome.status === "rejected") {
    assert.ok(outcome.errors.some((e) => e.message.includes("BLOCKED_SOURCE_CONFLICT")));
  }
});

test("a conformance rule cannot be produced when authority resolution is BLOCKED_SOURCE_UNAVAILABLE", () => {
  const unavailable: AuthorityResolution = { status: "BLOCKED_SOURCE_UNAVAILABLE", reason: "test: nothing matched scope" };
  const outcome = proposeConformanceRule(noticeLeadTimeCandidate(), cwruStore(), unavailable);
  assert.equal(outcome.status, "rejected");
  if (outcome.status === "rejected") {
    assert.ok(outcome.errors.some((e) => e.message.includes("BLOCKED_SOURCE_UNAVAILABLE")));
  }
});

test("a well-warranted rule citing a source outside the authority-resolved set is rejected, even though its own warrant is perfectly valid", () => {
  const applicableToADifferentSource: AuthorityResolution = {
    status: "APPLICABLE",
    governingSourceId: "some-other-governing-source",
    supportingSourceIds: [],
    reason: "test",
  };
  const outcome = proposeConformanceRule(noticeLeadTimeCandidate(), cwruStore(), applicableToADifferentSource);
  assert.equal(outcome.status, "rejected");
  if (outcome.status === "rejected") {
    assert.ok(outcome.errors.some((e) => e.field === "sourceId"));
  }
});

test("a rule citing the resolved governing source is accepted once authority is APPLICABLE", () => {
  const outcome = proposeConformanceRule(noticeLeadTimeCandidate(), cwruStore(), cwruAuthority());
  assert.equal(outcome.status, "auto_promotable");
});

test("a rule citing a resolved supporting (implementing/extending) source is also accepted, not only the root governing source", () => {
  const supportive: AuthorityResolution = {
    status: "APPLICABLE",
    governingSourceId: "some-root",
    supportingSourceIds: ["cwru-formal-hearing"],
    reason: "test",
  };
  const outcome = proposeConformanceRule(noticeLeadTimeCandidate(), cwruStore(), supportive);
  assert.equal(outcome.status, "auto_promotable");
});

test("batch form partitions authority-rejected and authority-cleared candidates correctly", () => {
  const result = proposeConformanceRules([noticeLeadTimeCandidate(), relevantInfoCandidate()], cwruStore(), cwruAuthority());
  assert.equal(result.validated.length, 2);
  assert.equal(result.errors.length, 0);
});

// ---- conformanceChecker: CONFORMANT / NONCONFORMANT / UNDETERMINED ----

test("CWRU notice lead time: 5 full business days between notice and hearing is CONFORMANT", () => {
  const rule = promote(noticeLeadTimeCandidate());
  const log = new CaseEventLog();
  // Wed 2026-09-09 notice -> Wed 2026-09-16 hearing: Thu,Fri,Mon,Tue,Wed = 5 business days.
  log.append({ eventId: "e1", type: "hearing_notice_sent", occurredAt: "2026-09-09T09:00:00Z", detail: {} });
  log.append({ eventId: "e2", type: "hearing_held", occurredAt: "2026-09-16T09:00:00Z", detail: {} });
  const result = checkConformance(rule, log);
  assert.equal(result.status, "CONFORMANT");
});

test("CWRU notice lead time: hearing held only 2 business days after notice is NONCONFORMANT", () => {
  const rule = promote(noticeLeadTimeCandidate());
  const log = new CaseEventLog();
  log.append({ eventId: "e1", type: "hearing_notice_sent", occurredAt: "2026-09-09T09:00:00Z", detail: {} });
  log.append({ eventId: "e2", type: "hearing_held", occurredAt: "2026-09-11T09:00:00Z", detail: {} });
  const result = checkConformance(rule, log);
  assert.equal(result.status, "NONCONFORMANT");
});

test("CWRU notice lead time: notice sent but hearing not yet held is UNDETERMINED, not a violation", () => {
  const rule = promote(noticeLeadTimeCandidate());
  const log = new CaseEventLog();
  log.append({ eventId: "e1", type: "hearing_notice_sent", occurredAt: "2026-09-09T09:00:00Z", detail: {} });
  const result = checkConformance(rule, log);
  assert.equal(result.status, "UNDETERMINED");
});

test("CWRU notice lead time: neither event logged yet is UNDETERMINED", () => {
  const rule = promote(noticeLeadTimeCandidate());
  const result = checkConformance(rule, new CaseEventLog());
  assert.equal(result.status, "UNDETERMINED");
});

test("CWRU relevant information: disclosed before the hearing is CONFORMANT", () => {
  const rule = promote(relevantInfoCandidate());
  const log = new CaseEventLog();
  log.append({ eventId: "e1", type: "relevant_information_disclosed", occurredAt: "2026-09-10T00:00:00Z", detail: {} });
  log.append({ eventId: "e2", type: "hearing_held", occurredAt: "2026-09-16T09:00:00Z", detail: {} });
  const result = checkConformance(rule, log);
  assert.equal(result.status, "CONFORMANT");
});

test("CWRU relevant information: hearing already held with no disclosure ever recorded is NONCONFORMANT -- the boundary event makes absence deterministic", () => {
  const rule = promote(relevantInfoCandidate());
  const log = new CaseEventLog();
  log.append({ eventId: "e2", type: "hearing_held", occurredAt: "2026-09-16T09:00:00Z", detail: {} });
  const result = checkConformance(rule, log);
  assert.equal(result.status, "NONCONFORMANT");
});

test("CWRU relevant information: hearing not yet held and nothing disclosed is UNDETERMINED, never a premature violation", () => {
  const rule = promote(relevantInfoCandidate());
  const result = checkConformance(rule, new CaseEventLog());
  assert.equal(result.status, "UNDETERMINED");
});

test("CWRU relevant information: disclosed on/after the hearing itself is NONCONFORMANT (out of order)", () => {
  const rule = promote(relevantInfoCandidate());
  const log = new CaseEventLog();
  log.append({ eventId: "e2", type: "hearing_held", occurredAt: "2026-09-16T09:00:00Z", detail: {} });
  log.append({ eventId: "e1", type: "relevant_information_disclosed", occurredAt: "2026-09-16T10:00:00Z", detail: {} });
  const result = checkConformance(rule, log);
  assert.equal(result.status, "NONCONFORMANT");
});

test("required_event without a boundary event never resolves to NONCONFORMANT, no matter how long the case runs", () => {
  const rule = promote({
    id: "no-boundary",
    sourceId: "cwru-formal-hearing",
    actor: "institution",
    constraint: { kind: "required_event", eventType: "hearing_notice_sent" },
    warrant: {
      sourceId: "cwru-formal-hearing",
      contentHash: hashContent(CWRU_TEXT),
      span: NOTICE_SPAN,
      quotedText: NOTICE_QUOTE,
      claimType: "directly_stated",
    },
  });
  const result = checkConformance(rule, new CaseEventLog());
  assert.equal(result.status, "UNDETERMINED");
});

test("required_event with a boundary: event recorded before the boundary closes is CONFORMANT", () => {
  const rule = promote(noticeMustExistCandidate());
  const log = new CaseEventLog();
  log.append({ eventId: "e1", type: "hearing_notice_sent", occurredAt: "2026-09-09T09:00:00Z", detail: {} });
  const result = checkConformance(rule, log);
  assert.equal(result.status, "CONFORMANT");
});

test("required_event with a boundary: boundary closed with the required event never recorded is NONCONFORMANT", () => {
  const rule = promote(noticeMustExistCandidate());
  const log = new CaseEventLog();
  log.append({ eventId: "e2", type: "hearing_held", occurredAt: "2026-09-16T09:00:00Z", detail: {} });
  const result = checkConformance(rule, log);
  assert.equal(result.status, "NONCONFORMANT");
});

test("checkAllConformance runs the full CWRU rule set against one case trace end to end", () => {
  const rules = [promote(noticeLeadTimeCandidate()), promote(relevantInfoCandidate()), promote(noticeMustExistCandidate())];
  const log = new CaseEventLog();
  log.append({ eventId: "e1", type: "hearing_notice_sent", occurredAt: "2026-09-09T09:00:00Z", detail: {} });
  log.append({ eventId: "e2", type: "relevant_information_disclosed", occurredAt: "2026-09-12T00:00:00Z", detail: {} });
  log.append({ eventId: "e3", type: "hearing_held", occurredAt: "2026-09-16T09:00:00Z", detail: {} });

  const results = checkAllConformance(rules, log);
  assert.equal(results.length, 3);
  assert.ok(results.every((r) => r.status === "CONFORMANT"));
});
