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

/** The same trace, plus a record that the respondent actually waived notice. */
const EVENTS_WITH_WAIVER: CaseEvent[] = [
  ...EVENTS,
  {
    eventId: "cw-e5",
    type: "hearing_notice_waived",
    occurredAt: "2026-03-20T11:00:00Z",
    detail: { synthetic: true, note: "respondent waived the five-business-day notice period in writing" },
  },
];

/** The same trace, plus a record affirmatively establishing that no waiver was given. */
const EVENTS_WITH_WAIVER_DECLINED: CaseEvent[] = [
  ...EVENTS,
  {
    eventId: "cw-e6",
    type: "hearing_notice_waiver_declined",
    occurredAt: "2026-03-20T11:00:00Z",
    detail: { synthetic: true, note: "respondent was asked to waive notice and declined in writing" },
  },
];

/**
 * The waiver the source attaches to the notice provision, in the SAME list
 * item as the requirement itself. Both event types are named up front: one
 * that would establish a waiver was given, one that would establish it was
 * not. Neither may be inferred from the other's absence.
 */
const NOTICE_WAIVER = {
  id: "cwru-notice-waiver",
  description: "the respondent may waive the five-business-day notice period to expedite resolution",
  establishedByEventType: "hearing_notice_waived",
  negatedByEventType: "hearing_notice_waiver_declined",
  quotedText: Q_WAIVER,
  claimType: "directly_stated" as const,
};

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
  exception: NOTICE_WAIVER,
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
  exception: NOTICE_WAIVER,
};

export const cwruHearingNotice: BenchCase = {
  id: "cwru-hearing-notice",
  institution: "Case Western Reserve University",
  procedure: "University Code of Conduct — Formal Hearing Process",
  sourceIds: [SOURCE_ID],
  sourceUrls: [URL],
  notes: [
    "The source attaches an explicit waiver to the notice provision, in the same list item as the requirement: \"A respondent may choose to waive this notice in the interests of expediting resolution of the case.\" The notice rule therefore carries that waiver as a modelled exception, and the three runs below cover all three evidentiary states — waiver recorded, waiver affirmatively ruled out, and neither on the record. In the last of those the finding is UNDETERMINED, not NONCONFORMANT: a case record that never mentions waivers is not evidence that no waiver was given.",
    "The relevant-information provision is a SEPARATE list item and the waiver sentence does not reach it. It is therefore the clean lead-time conformance rule in this case, and the one the demo leads with.",
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
      // The same short-notice hearing, with the respondent's waiver on record.
      waiverRecorded: {
        ...base,
        events: EVENTS_WITH_WAIVER,
        rawConformanceRules: [noticeRule, informationRule, orderingRule],
      },
      // The same short-notice hearing, with a record that affirmatively
      // establishes no waiver was given.
      waiverRuledOut: {
        ...base,
        events: EVENTS_WITH_WAIVER_DECLINED,
        rawConformanceRules: [noticeRule, informationRule, orderingRule],
      },
      // A waiver asserted with text that is not in the document.
      fabricatedWaiver: {
        ...base,
        rawConformanceRules: [
          {
            ...noticeRule,
            exception: {
              ...NOTICE_WAIVER,
              quotedText: "A respondent may waive any requirement of this procedure at the institution's request.",
            },
          },
        ],
      },
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
      id: "cwru-notice-unresolved-waiver-is-undetermined",
      run: "hearingTooSoon",
      semanticFeature:
        "A requirement the source itself makes waivable, evaluated against a record that says nothing about a waiver",
      expected:
        "UNDETERMINED with exception state UNRESOLVED — the 5-business-day period was not met, and whether that is a violation cannot be determined until the record settles the waiver",
      shortcutRisk:
        "Reporting a confident NONCONFORMANT because no waiver is recorded. That is inferring the absence of a waiver from the absence of evidence — and a respondent who did waive notice got exactly the process the policy provides, so the finding would be flatly wrong and would discredit every other finding in the same record.",
      check: (r) => {
        const f = r.conformance.find((c) => c.ruleId === "cwru-hearing-notice-lead-time");
        return expectTrue(
          f?.status === "UNDETERMINED" && f.exception?.state === "UNRESOLVED",
          `${f?.status ?? "no finding"} / exception ${f?.exception?.state ?? "none"}: ${f?.reason ?? ""}`
        );
      },
    },
    {
      id: "cwru-notice-waiver-applies",
      run: "waiverRecorded",
      semanticFeature: "The waiver is on the record",
      expected: "EXCEPTION_APPLIES with exception state APPLIES — not a violation, and not silently reported as conformance either",
      shortcutRisk:
        "Collapsing 'excused by a stated exception' into 'CONFORMANT', which hides from the reader that the requirement was not met as written.",
      check: (r) => {
        const f = r.conformance.find((c) => c.ruleId === "cwru-hearing-notice-lead-time");
        return expectTrue(
          f?.status === "EXCEPTION_APPLIES" && f.exception?.state === "APPLIES",
          `${f?.status ?? "no finding"} / exception ${f?.exception?.state ?? "none"}`
        );
      },
    },
    {
      id: "cwru-notice-nonconformant-once-waiver-ruled-out",
      run: "waiverRuledOut",
      semanticFeature: "Minimum notice lead time (5 business days), on a record that affirmatively rules the waiver out",
      expected: "NONCONFORMANT, with the computed earliest permissible hearing date 2026-03-27 shown",
      shortcutRisk:
        "Reporting 'notice was given' because a notice event exists, without computing whether it was given early enough.",
      check: (r) => {
        const f = r.conformance.find((c) => c.ruleId === "cwru-hearing-notice-lead-time");
        return expectTrue(
          f?.status === "NONCONFORMANT" && f.exception?.state === "EXCLUDED" && f.reason.includes("2026-03-27"),
          `${f?.status ?? "no finding"} / exception ${f?.exception?.state ?? "none"}: ${f?.reason ?? ""}`
        );
      },
    },
    {
      id: "cwru-fabricated-waiver-rejected",
      run: "fabricatedWaiver",
      semanticFeature: "An exception asserted with text that is not in the captured source",
      expected: "Rejected; an unverifiable waiver never silences a requirement",
      shortcutRisk:
        "An invented waiver excuses the institution. Of the two directions an unwarranted claim can fail, this is the one that costs the student, so it is refused rather than dropped back to 'no exception'.",
      check: (r) =>
        expectTrue(
          r.conformanceRules.validated.length === 0 && r.conformanceRules.rejected.length > 0 && r.conformance.length === 0,
          `${r.conformanceRules.validated.length} validated, ${r.conformanceRules.rejected.length} rejected, ${r.conformance.length} finding(s)`
        ),
    },
    {
      id: "cwru-information-nonconformant",
      run: "hearingTooSoon",
      semanticFeature:
        "Relevant-information availability lead time — a separate list item, which the waiver sentence does not reach",
      expected: "NONCONFORMANT, evaluated independently of the notice rule and unaffected by the notice waiver",
      shortcutRisk:
        "Collapsing two distinct institutional obligations into one 'notice' finding — or letting the waiver attached to one of them quietly excuse the other.",
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
        "A confabulated 'ten business days' reads exactly like the real provision and would produce a stronger-looking result. " +
        "Note that this is fabricated FOR CWRU, whose text says five: a ten-business-day figure is a real institutional deadline elsewhere " +
        "(UIC's Administrative Officer decision, for one), so 'ten business days' is not a fabrication in general and must not be presented as one.",
      check: (r) =>
        expectTrue(
          r.conformanceRules.validated.length === 0 && r.conformanceRules.rejected.length > 0 && r.conformance.length === 0,
          `${r.conformanceRules.rejected.length} rejected, ${r.conformance.length} finding(s)`
        ),
    },
  ],
};

export const CWRU_EVIDENCE = { Q_NOTICE_LEAD_TIME, Q_INFORMATION_LEAD_TIME, Q_WAIVER };
