import type { BenchCase } from "../benchCase.ts";
import { expectTrue } from "../benchCase.ts";
import type { PolicySource } from "../../src/types/authority.ts";
import type { CaseEvent } from "../../src/types/case.ts";

const SOURCE_ID = "cwru-formal-hearing";
const URL = "https://case.edu/studentlife/conduct/university-code-conduct/procedures/formal-hearing-process";

/** Verbatim spans from the pinned HTML capture. */
const Q_NOTICE_LEAD_TIME =
  "The hearing date, time and location will be communicated to the respondents at least five business days prior to the hearing.";

const Q_INFORMATION_LEAD_TIME = "Information will be available at least five business days prior to the hearing.";

const Q_WAIVER = "A respondent may choose to waive this notice in the interests of expediting resolution of the case.";

const source: PolicySource = {
  sourceId: SOURCE_ID,
  institution: "Case Western Reserve University",
  authorityLevel: "campus_wide",
  scope: { institution: "Case Western Reserve University", decisionTypes: ["student_conduct_formal_hearing"] },
  effective: { effectiveDate: "2026-08-21", versionId: "Last Updated: August 21, 2026" },
};

/**
 * Synthetic case: notice sent Friday 2026-03-20, hearing held Monday
 * 2026-03-23. One business day of notice against a required five.
 */
const EVENTS: CaseEvent[] = [
  { eventId: "cw-e1", type: "case_opened", occurredAt: "2026-03-16T09:00:00Z", detail: { synthetic: true } },
  { eventId: "cw-e2", type: "hearing_notice_sent", occurredAt: "2026-03-20T09:00:00Z", detail: { synthetic: true } },
  {
    eventId: "cw-e3",
    type: "relevant_information_disclosed",
    occurredAt: "2026-03-20T14:00:00Z",
    detail: { synthetic: true },
  },
  { eventId: "cw-e4", type: "hearing_held", occurredAt: "2026-03-23T09:00:00Z", detail: { synthetic: true } },
];

const noticeRule = {
  rule: {
    id: "cwru-hearing-notice-lead-time",
    sourceId: SOURCE_ID,
    actor: "institution",
    constraint: {
      kind: "minimum_lead_time" as const,
      anchorEventType: "hearing_notice_sent",
      targetEventType: "hearing_held",
      minimum: { amount: 5, unit: "business_day" as const },
    },
  },
  quotedText: Q_NOTICE_LEAD_TIME,
  claimType: "directly_stated" as const,
};

const informationRule = {
  rule: {
    id: "cwru-information-lead-time",
    sourceId: SOURCE_ID,
    actor: "institution",
    constraint: {
      kind: "minimum_lead_time" as const,
      anchorEventType: "relevant_information_disclosed",
      targetEventType: "hearing_held",
      minimum: { amount: 5, unit: "business_day" as const },
    },
  },
  quotedText: Q_INFORMATION_LEAD_TIME,
  claimType: "directly_stated" as const,
};

const orderingRule = {
  rule: {
    id: "cwru-notice-before-hearing",
    sourceId: SOURCE_ID,
    actor: "institution",
    constraint: {
      kind: "required_before" as const,
      eventType: "hearing_notice_sent",
      beforeEventType: "hearing_held",
    },
  },
  quotedText: Q_NOTICE_LEAD_TIME,
  claimType: "directly_stated" as const,
};

export const cwruHearingNotice: BenchCase = {
  id: "cwru-hearing-notice",
  institution: "Case Western Reserve University",
  procedure: "University Code of Conduct — Formal Hearing Process",
  sourceIds: [SOURCE_ID],
  sourceUrls: [URL],
  notes: [
    "The source attaches an explicit waiver to the notice provision: \"A respondent may choose to waive this notice in the interests of expediting resolution of the case.\" No waiver event is recorded in this synthetic trace, and the current conformance IR has no waiver construct, so the finding below is correct only for a case where no waiver occurred. A trace of a real case would need the waiver recorded as an event before this finding could stand.",
    "Because the extractor for HTML is the identity extractor, warrant spans here are checked against the raw served HTML. That is deliberately honest about what was actually fetched.",
  ],

  runs: (sources) => {
    const base = {
      caseId: "bench-cwru-hearing",
      evaluationAt: "2026-03-24T00:00:00Z",
      dataMarker: "synthetic",
      sources: [...sources],
      policySources: [source],
      authorityQuery: {
        institution: "Case Western Reserve University",
        decisionType: "student_conduct_formal_hearing",
      },
      events: EVENTS,
    };

    return {
      hearingTooSoon: { ...base, rawConformanceRules: [noticeRule, informationRule, orderingRule] },
      // Same rules, same procedure -- but the hearing has not been held yet.
      hearingNotYetHeld: {
        ...base,
        evaluationAt: "2026-03-21T00:00:00Z",
        events: EVENTS.filter((e) => e.type !== "hearing_held"),
        rawConformanceRules: [noticeRule, informationRule, orderingRule],
      },
      // An inferred reading of the same text may not become an executable rule.
      inferredClaim: {
        ...base,
        rawConformanceRules: [{ ...noticeRule, claimType: "inferred" as const }],
      },
      // A quote that is not in the document at all.
      fabricatedQuote: {
        ...base,
        rawConformanceRules: [
          {
            ...noticeRule,
            quotedText:
              "The hearing date, time and location must be communicated to the respondent at least ten business days prior to the hearing.",
          },
        ],
      },
    };
  },

  expectations: [
    {
      id: "cwru-notice-nonconformant",
      run: "hearingTooSoon",
      semanticFeature: "Minimum notice lead time (5 business days) against the observed trace",
      expected: "NONCONFORMANT, with the computed earliest permissible hearing date 2026-03-27 shown",
      shortcutRisk:
        "Reporting 'notice was given' because a notice event exists, without computing whether it was given early enough.",
      check: (r) => {
        const f = r.conformance.find((c) => c.ruleId === "cwru-hearing-notice-lead-time");
        return expectTrue(
          f?.status === "NONCONFORMANT" && f.reason.includes("2026-03-27"),
          `${f?.status ?? "no finding"}: ${f?.reason ?? ""}`
        );
      },
    },
    {
      id: "cwru-information-nonconformant",
      run: "hearingTooSoon",
      semanticFeature: "Relevant-information availability lead time, a separate obligation from notice",
      expected: "NONCONFORMANT, evaluated independently of the notice rule",
      shortcutRisk: "Collapsing two distinct institutional obligations into one 'notice' finding.",
      check: (r) => {
        const f = r.conformance.find((c) => c.ruleId === "cwru-information-lead-time");
        return expectTrue(f?.status === "NONCONFORMANT", `${f?.status ?? "no finding"}`);
      },
    },
    {
      id: "cwru-ordering-conformant",
      run: "hearingTooSoon",
      semanticFeature: "Ordering constraint satisfied even though the lead-time constraint is violated",
      expected: "CONFORMANT — notice did precede the hearing; only its timing was short",
      shortcutRisk:
        "Marking everything about a flawed hearing as violated, which destroys the credibility of the specific finding that matters.",
      check: (r) => {
        const f = r.conformance.find((c) => c.ruleId === "cwru-notice-before-hearing");
        return expectTrue(f?.status === "CONFORMANT", `${f?.status ?? "no finding"}`);
      },
    },
    {
      id: "cwru-undetermined-before-hearing",
      run: "hearingNotYetHeld",
      semanticFeature: "Fail-closed: a lead-time rule cannot resolve before the target event occurs",
      expected: "UNDETERMINED, not a pre-emptive violation",
      shortcutRisk: "Warning a student their hearing is already improper before it has happened.",
      check: (r) => {
        const f = r.conformance.find((c) => c.ruleId === "cwru-hearing-notice-lead-time");
        return expectTrue(f?.status === "UNDETERMINED", `${f?.status ?? "no finding"}: ${f?.reason ?? ""}`);
      },
    },
    {
      id: "cwru-inferred-not-executable",
      run: "inferredClaim",
      semanticFeature: "An inferred procedural reading is never auto-promoted",
      expected: "Held for human review; zero conformance findings produced",
      shortcutRisk: "Treating a confident interpretation as equivalent to a quoted rule.",
      check: (r) =>
        expectTrue(
          r.conformanceRules.validated.length === 0 && r.conformanceRules.needsReview.length === 1 && r.conformance.length === 0,
          `${r.conformanceRules.validated.length} validated, ${r.conformanceRules.needsReview.length} in review, ${r.conformance.length} finding(s)`
        ),
    },
    {
      id: "cwru-fabricated-quote-rejected",
      run: "fabricatedQuote",
      semanticFeature: "A plausible but fabricated quotation",
      expected: "Rejected; no finding is produced from text that is not in the captured source",
      shortcutRisk:
        "A confabulated 'ten business days' reads exactly like the real provision and would produce a stronger-looking result.",
      check: (r) =>
        expectTrue(
          r.conformanceRules.validated.length === 0 && r.conformanceRules.rejected.length > 0 && r.conformance.length === 0,
          `${r.conformanceRules.rejected.length} rejected, ${r.conformance.length} finding(s)`
        ),
    },
  ],
};

export const CWRU_EVIDENCE = { Q_NOTICE_LEAD_TIME, Q_INFORMATION_LEAD_TIME, Q_WAIVER };
