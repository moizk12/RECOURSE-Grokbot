import test from "node:test";
import assert from "node:assert/strict";
import { checkConformance } from "../src/conformance/conformanceChecker.ts";
import { validateConformanceRule } from "../src/conformance/conformanceValidator.ts";
import { proposeRawConformanceRule, type RawConformanceProposal } from "../src/conformance/rawConformance.ts";
import { resolveAuthority, type AuthorityResolution } from "../src/authority/authorityResolver.ts";
import { captureSource, SourceStore } from "../src/warrant/sourceStore.ts";
import { CaseEventLog } from "../src/case/eventLog.ts";
import type { CaseEvent } from "../src/types/case.ts";
import type { CandidateConformanceRule, ValidatedConformanceRule } from "../src/types/conformance.ts";
import type { PolicySource } from "../src/types/authority.ts";

/**
 * Exception / waiver semantics.
 *
 * The provision these tests are built around is real. CWRU's Formal Hearing
 * Process puts the notice requirement and its waiver in the same sentence
 * pair: notice at least five business days before the hearing, and "A
 * respondent may choose to waive this notice in the interests of expediting
 * resolution of the case." A checker that models only the first half will
 * report a short-notice hearing as a determined violation -- confidently,
 * with a correct quote and a correct date calculation, and possibly wrongly.
 *
 * The rule these tests enforce is the one that matters: ABSENCE OF A WAIVER
 * IN THE RECORD IS NEVER EVIDENCE THAT NO WAIVER WAS GIVEN.
 */

const SOURCE_ID = "src-hearing";

const TEXT =
  "The hearing date will be communicated to the respondent at least five business days prior to the hearing. " +
  "A respondent may choose to waive this notice in the interests of expediting resolution of the case. " +
  "Information will be available at least five business days prior to the hearing.";

const NOTICE_QUOTE = "The hearing date will be communicated to the respondent at least five business days prior to the hearing.";
const WAIVER_QUOTE = "A respondent may choose to waive this notice in the interests of expediting resolution of the case.";
const INFO_QUOTE = "Information will be available at least five business days prior to the hearing.";

function store(): SourceStore {
  return new SourceStore([
    captureSource({ sourceId: SOURCE_ID, requestedUrl: "https://example.edu/hearing", retrievedAt: "2026-01-01T00:00:00Z", content: TEXT }),
  ]);
}

const policySource: PolicySource = {
  sourceId: SOURCE_ID,
  institution: "Example University",
  authorityLevel: "campus_wide",
  scope: { institution: "Example University", decisionTypes: ["formal_hearing"] },
  effective: { effectiveDate: "2024-08-01" },
};

function authority(): AuthorityResolution {
  return resolveAuthority([policySource], [], {
    institution: "Example University",
    decisionType: "formal_hearing",
    asOf: "2026-03-24T00:00:00Z",
  });
}

/** Notice sent Friday, hearing held Monday: one business day against a required five. */
const SHORT_NOTICE: CaseEvent[] = [
  { eventId: "e1", type: "hearing_notice_sent", occurredAt: "2026-03-20T09:00:00Z", detail: {} },
  { eventId: "e2", type: "hearing_held", occurredAt: "2026-03-23T09:00:00Z", detail: {} },
];

const WAIVED: CaseEvent = { eventId: "e3", type: "hearing_notice_waived", occurredAt: "2026-03-20T11:00:00Z", detail: {} };
const DECLINED: CaseEvent = { eventId: "e4", type: "hearing_notice_waiver_declined", occurredAt: "2026-03-20T11:00:00Z", detail: {} };

function noticeProposal(overrides: Partial<RawConformanceProposal> = {}): RawConformanceProposal {
  return {
    rule: {
      id: "notice-lead-time",
      sourceId: SOURCE_ID,
      actor: "institution",
      constraint: {
        kind: "minimum_lead_time",
        anchorEventType: "hearing_notice_sent",
        targetEventType: "hearing_held",
        minimum: { amount: 5, unit: "business_day" },
      },
    },
    quotedText: NOTICE_QUOTE,
    claimType: "directly_stated",
    exception: {
      id: "notice-waiver",
      description: "the respondent may waive the five-business-day notice period",
      establishedByEventType: "hearing_notice_waived",
      negatedByEventType: "hearing_notice_waiver_declined",
      quotedText: WAIVER_QUOTE,
      claimType: "directly_stated",
    },
    ...overrides,
  };
}

function validatedNoticeRule(proposal: RawConformanceProposal = noticeProposal()): ValidatedConformanceRule {
  const outcome = proposeRawConformanceRule(proposal, store(), authority());
  assert.equal(outcome.status, "auto_promotable", `rule did not validate: ${JSON.stringify(outcome)}`);
  if (outcome.status !== "auto_promotable") throw new Error("unreachable");
  return outcome.rule;
}

function findingOn(events: CaseEvent[], rule: ValidatedConformanceRule = validatedNoticeRule()) {
  return checkConformance(rule, new CaseEventLog(events));
}

// ---------------------------------------------------------------------------
// The four states the product must distinguish.
// ---------------------------------------------------------------------------

test("requirement violated, waiver affirmatively ruled out -> NONCONFORMANT / EXCLUDED", () => {
  const f = findingOn([...SHORT_NOTICE, DECLINED]);
  assert.equal(f.status, "NONCONFORMANT");
  assert.equal(f.exception?.state, "EXCLUDED");
  assert.match(f.reason, /2026-03-27/, "the computed boundary date must still be shown");
});

test("waiver on the record -> EXCEPTION_APPLIES / APPLIES, and it is NOT reported as CONFORMANT", () => {
  const f = findingOn([...SHORT_NOTICE, WAIVED]);
  assert.equal(f.status, "EXCEPTION_APPLIES");
  assert.equal(f.exception?.state, "APPLIES");
  assert.notEqual(f.status, "CONFORMANT", "an excused requirement was still not met as written; saying CONFORMANT hides that");
});

test("waiver unresolved -> UNDETERMINED / UNRESOLVED, never a determined violation", () => {
  const f = findingOn(SHORT_NOTICE);
  assert.equal(f.status, "UNDETERMINED");
  assert.equal(f.exception?.state, "UNRESOLVED");
  assert.match(f.reason, /NOT evidence that no waiver was given/);
});

test("requirement satisfied -> CONFORMANT, and the exception is simply never reached", () => {
  const f = findingOn([
    { eventId: "e1", type: "hearing_notice_sent", occurredAt: "2026-03-02T09:00:00Z", detail: {} },
    { eventId: "e2", type: "hearing_held", occurredAt: "2026-03-20T09:00:00Z", detail: {} },
  ]);
  assert.equal(f.status, "CONFORMANT");
  assert.equal(f.exception?.state, "NOT_APPLICABLE");
});

// ---------------------------------------------------------------------------
// The specific inference this layer refuses to make.
// ---------------------------------------------------------------------------

test("adversarial: an empty record does not license 'no waiver occurred'", () => {
  const noExceptionRule = validatedNoticeRule(noticeProposal({ exception: undefined }));
  const withoutException = checkConformance(noExceptionRule, new CaseEventLog(SHORT_NOTICE));
  const withException = findingOn(SHORT_NOTICE);

  assert.equal(withoutException.status, "NONCONFORMANT", "control: an unqualified requirement on the same trace does resolve");
  assert.equal(
    withException.status,
    "UNDETERMINED",
    "the ONLY difference is that the source states a waiver -- and that alone must be enough to stop the determined finding"
  );
});

test("an exception can only ever excuse a violation, never manufacture one", () => {
  // The waiver event is present, but the requirement was met anyway.
  const f = findingOn([
    { eventId: "e1", type: "hearing_notice_sent", occurredAt: "2026-03-02T09:00:00Z", detail: {} },
    { eventId: "e2", type: "hearing_held", occurredAt: "2026-03-20T09:00:00Z", detail: {} },
    WAIVED,
  ]);
  assert.equal(f.status, "CONFORMANT");
});

test("an unresolved exception does not leak onto a sibling rule quoting a different provision", () => {
  const infoRule = validatedNoticeRule({
    rule: {
      id: "info-lead-time",
      sourceId: SOURCE_ID,
      actor: "institution",
      constraint: {
        kind: "minimum_lead_time",
        anchorEventType: "relevant_information_disclosed",
        targetEventType: "hearing_held",
        minimum: { amount: 5, unit: "business_day" },
      },
    },
    quotedText: INFO_QUOTE,
    claimType: "directly_stated",
    exception: undefined,
  });
  const f = checkConformance(
    infoRule,
    new CaseEventLog([
      { eventId: "e5", type: "relevant_information_disclosed", occurredAt: "2026-03-20T14:00:00Z", detail: {} },
      ...SHORT_NOTICE,
    ])
  );
  assert.equal(f.status, "NONCONFORMANT", "the waiver sentence attaches to the notice provision, not to this one");
  assert.equal(f.exception, undefined);
});

// ---------------------------------------------------------------------------
// An exception is evidence, and is held to the same standard as everything else.
// ---------------------------------------------------------------------------

test("adversarial: a fabricated waiver quote is rejected, not silently dropped back to 'no exception'", () => {
  const outcome = proposeRawConformanceRule(
    noticeProposal({
      exception: {
        id: "notice-waiver",
        description: "the institution may waive anything",
        establishedByEventType: "hearing_notice_waived",
        negatedByEventType: "hearing_notice_waiver_declined",
        quotedText: "The university may waive any requirement of this procedure at its sole discretion.",
        claimType: "directly_stated",
      },
    }),
    store(),
    authority()
  );
  assert.equal(outcome.status, "rejected", "dropping the exception would restore exactly the determined finding it qualifies");
  if (outcome.status !== "rejected") return;
  assert.ok(outcome.errors.some((e) => e.field.includes("exception")));
});

test("an inferred waiver reading may not make a requirement waivable", () => {
  const outcome = proposeRawConformanceRule(
    noticeProposal({
      exception: {
        id: "notice-waiver",
        description: "the respondent may waive notice",
        establishedByEventType: "hearing_notice_waived",
        negatedByEventType: "hearing_notice_waiver_declined",
        quotedText: WAIVER_QUOTE,
        claimType: "inferred",
      },
    }),
    store(),
    authority()
  );
  assert.equal(outcome.status, "needs_review");
});

test("an exception with no affirmative way to be ruled out is rejected at validation", () => {
  const candidate: CandidateConformanceRule = {
    id: "notice-lead-time",
    sourceId: SOURCE_ID,
    actor: "institution",
    constraint: {
      kind: "minimum_lead_time",
      anchorEventType: "hearing_notice_sent",
      targetEventType: "hearing_held",
      minimum: { amount: 5, unit: "business_day" },
    },
    warrant: {
      sourceId: SOURCE_ID,
      contentHash: store().get(SOURCE_ID)!.contentHash,
      span: { start: TEXT.indexOf(NOTICE_QUOTE), end: TEXT.indexOf(NOTICE_QUOTE) + NOTICE_QUOTE.length },
      quotedText: NOTICE_QUOTE,
      claimType: "directly_stated",
    },
    exception: {
      id: "notice-waiver",
      description: "the respondent may waive notice",
      establishedByEventType: "hearing_notice_waived",
      negatedByEventType: "",
      warrant: {
        sourceId: SOURCE_ID,
        contentHash: store().get(SOURCE_ID)!.contentHash,
        span: { start: TEXT.indexOf(WAIVER_QUOTE), end: TEXT.indexOf(WAIVER_QUOTE) + WAIVER_QUOTE.length },
        quotedText: WAIVER_QUOTE,
        claimType: "directly_stated",
      },
    },
  };
  const outcome = validateConformanceRule(candidate, store());
  assert.equal(outcome.status, "rejected", "without a negating event type the rule could never resolve back to a violation");
  if (outcome.status !== "rejected") return;
  assert.ok(outcome.errors.some((e) => e.field === "exception.negatedByEventType"));
});
