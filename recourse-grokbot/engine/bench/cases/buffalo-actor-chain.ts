import type { BenchCase } from "../benchCase.ts";
import { expectTrue } from "../benchCase.ts";
import type { PolicySource } from "../../src/types/authority.ts";
import type { CaseEvent } from "../../src/types/case.ts";

const SOURCE_ID = "buffalo-academic-integrity";
const URL = "https://www.buffalo.edu/academic-integrity/policies/ug-academic-integrity-procedures.html";

/**
 * Verbatim spans from the pinned HTML capture. The first one contains a
 * footnote marker mid-sentence (`<sup>ii</sup>`) exactly as served. It is
 * kept rather than cleaned: the warrant is checked against what was actually
 * fetched, and quietly normalizing markup out of a quote would make the span
 * check weaker than it looks.
 */
const Q_INSTRUCTOR_NOTIFY =
  "the instructor shall notify the student within 10 academic days<sup>ii</sup> of discovery of the alleged incident by email to the student's UB email address.";

const Q_STUDENT_MEETING_WINDOW =
  "Students have 10 academic days from notification to meet with the instructor for consultative resolution.";

const Q_MATERIALS_LEAD_TIME =
  "All relevant materials are shared with the instructor, the student, and the hearing committee at least 72 hours prior to the start of the hearing.";

const Q_ACADEMIC_DAYS_DEFINED = "Academic days are defined as weekdays, when classes are in session";

/**
 * The instructor's post-meeting obligation. Binding on its face ("shall"),
 * and anchored on a step that may or may not have happened yet -- which is
 * what makes it the actor-chained clock this case exists to test.
 */
const Q_INSTRUCTOR_POST_MEETING =
  "Within 10 academic days of the consultative resolution meeting, the instructor shall:";

const source: PolicySource = {
  sourceId: SOURCE_ID,
  institution: "University at Buffalo",
  authorityLevel: "campus_wide",
  scope: { institution: "University at Buffalo", decisionTypes: ["academic_integrity_undergraduate"] },
  effective: { effectiveDate: "2024-08-01" },
};

/**
 * Synthetic case. The instructor never sends the written notification, but
 * the process moves on anyway: a hearing is held on 2026-03-23.
 */
const EVENTS: CaseEvent[] = [
  { eventId: "ub-e1", type: "case_opened", occurredAt: "2026-03-02T09:00:00Z", detail: { synthetic: true } },
  {
    eventId: "ub-e2",
    type: "relevant_information_disclosed",
    occurredAt: "2026-03-22T09:00:00Z",
    detail: { synthetic: true },
  },
  { eventId: "ub-e3", type: "hearing_held", occurredAt: "2026-03-23T09:00:00Z", detail: { synthetic: true } },
];

/**
 * The same trace, but with the instructor's written notice actually sent and
 * the consultative resolution meeting actually held -- the upstream step the
 * instructor's Step 3 clock runs from.
 */
const EVENTS_WITH_NOTICE: CaseEvent[] = [
  EVENTS[0]!,
  { eventId: "ub-e1b", type: "hearing_notice_sent", occurredAt: "2026-03-04T09:00:00Z", detail: { synthetic: true } },
  {
    eventId: "ub-e1c",
    type: "consultative_meeting_held",
    occurredAt: "2026-03-04T09:00:00Z",
    detail: { synthetic: true },
  },
  ...EVENTS.slice(1),
];

const notificationRule = {
  rule: {
    id: "ub-instructor-written-notification",
    sourceId: SOURCE_ID,
    actor: "instructor",
    constraint: {
      kind: "required_event" as const,
      eventType: "hearing_notice_sent",
      // Absence only becomes a violation once the hearing has actually
      // happened -- never merely because time has passed.
      closesUponEventType: "hearing_held",
    },
  },
  quotedText: Q_INSTRUCTOR_NOTIFY,
  claimType: "directly_stated" as const,
};

const materialsRule = {
  rule: {
    id: "ub-materials-72-hours",
    sourceId: SOURCE_ID,
    actor: "institution",
    constraint: {
      kind: "minimum_lead_time" as const,
      anchorEventType: "relevant_information_disclosed",
      targetEventType: "hearing_held",
      minimum: { amount: 3, unit: "calendar_day" as const },
    },
  },
  quotedText: Q_MATERIALS_LEAD_TIME,
  claimType: "directly_stated" as const,
};

/**
 * The chained institutional clock: the instructor's Step 3 obligation runs
 * from the consultative resolution meeting, not from the incident, so it
 * cannot resolve at all until that upstream step is on the record.
 */
const instructorPostMeetingRule = {
  rule: {
    id: "ub-instructor-post-meeting-decision",
    policyId: "buffalo-academic-integrity",
    kind: "obligation" as const,
    provenance: {
      sourceUrl: URL,
      retrievedAt: "2026-03-02T00:00:00Z",
      sourceSpan: Q_INSTRUCTOR_POST_MEETING,
      actor: "instructor",
    },
    actor: "instructor",
    action: "notify_student_of_decision_and_file_report",
    trigger: { eventType: "consultative_meeting_held" },
    conditions: [],
    deonticForce: "SHALL" as const,
    deadline: {
      type: "relative" as const,
      amount: 10,
      unit: "business_day" as const,
      fromEvent: "consultative_meeting_held",
    },
  },
  sourceId: SOURCE_ID,
  quotedText: Q_INSTRUCTOR_POST_MEETING,
  claimType: "directly_stated" as const,
};

/**
 * ADVERSARIAL. UB states the student's consultative window as a bare period
 * with no modal verb at all -- "Students have 10 academic days from
 * notification to meet with the instructor" -- and the very next sentence
 * says what happens if they do not, which is that the instructor may decide
 * without them. Encoding that as a binding student MUST is an over-claim
 * against a student, made from a quotation that is verbatim correct. The
 * deontic-support gate (src/validation/deonticSupport.ts) is what refuses it.
 */
const studentWindowAsMustRule = {
  rule: {
    id: "ub-student-consultative-window",
    policyId: "buffalo-academic-integrity",
    kind: "obligation" as const,
    provenance: {
      sourceUrl: URL,
      retrievedAt: "2026-03-02T00:00:00Z",
      sourceSpan: Q_STUDENT_MEETING_WINDOW,
      actor: "student",
    },
    actor: "student",
    action: "meet_for_consultative_resolution",
    trigger: { eventType: "hearing_notice_sent" },
    conditions: [],
    deonticForce: "MUST" as const,
    deadline: {
      type: "relative" as const,
      amount: 10,
      unit: "business_day" as const,
      fromEvent: "hearing_notice_sent",
    },
  },
  sourceId: SOURCE_ID,
  quotedText: Q_STUDENT_MEETING_WINDOW,
  claimType: "directly_stated" as const,
};

export const buffaloActorChain: BenchCase = {
  id: "buffalo-actor-chain",
  institution: "University at Buffalo",
  procedure: "Undergraduate Academic Integrity Procedures",
  sourceIds: [SOURCE_ID],
  sourceUrls: [URL],
  notes: [
    "SUBSTITUTED for the originally planned University of Connecticut Student Code Appendix A. That single UConn URL serves the current 2023 ASPIM policy AND the superseded 2008/2012 academic misconduct policy with no archival marker separating them, and the two give different numbers for the same step (10 vs 5 business days to contest). The instructor-notification deadline the benchmark needed exists only in the superseded block. Encoding it would have meant benchmarking against text the university no longer applies, so the source was replaced rather than the requirement weakened.",
    "UB is a strictly better fit for this feature: one regime on one page, imperative modality throughout, and the document defines its own day unit (\"Academic days are defined as weekdays, when classes are in session\").",
    "That definition excludes summer/winter sessions, reading days and finals — a unit the current FixedHolidayCalendar cannot express, since it takes a fixed holiday list rather than an academic calendar. The rules below therefore model business_day, which is a WIDER window than UB's academic day. The benchmark records this as a known modelling gap rather than asserting an academic-day result the engine cannot compute.",
    "Re-captured during the v1.0.1 release gate: the canonical text is byte-identical apart from a CDN cache-buster in an og:image URL, which changes the contentHash on every fetch while changing nothing in the procedure. Same caveat as the Minnesota page — a CHANGED drift result on this source is not evidence that a rule changed.",
    "The chained clock is the instructor's Step 3 obligation (\"Within 10 academic days of the consultative resolution meeting, the instructor shall:\"), not the student's consultative window. UB states the student's window with no modal verb at all — \"Students have 10 academic days from notification to meet with the instructor\" — so the deontic-support gate correctly refuses to compile it as a binding student MUST. That refusal is itself an expectation below rather than something worked around.",
  ],

  runs: (sources) => {
    const base = {
      caseId: "bench-ub-integrity",
      evaluationAt: "2026-03-24T00:00:00Z",
      dataMarker: "synthetic",
      sources: [...sources],
      policySources: [source],
      authorityQuery: { institution: "University at Buffalo", decisionType: "academic_integrity_undergraduate" },
    };

    return {
      noticeNeverSent: {
        ...base,
        events: EVENTS,
        rawProposals: [instructorPostMeetingRule],
        rawConformanceRules: [notificationRule, materialsRule],
      },
      // The same rules, before the hearing has occurred: the window is still open.
      beforeHearing: {
        ...base,
        evaluationAt: "2026-03-10T00:00:00Z",
        events: [EVENTS[0]!],
        rawProposals: [instructorPostMeetingRule],
        rawConformanceRules: [notificationRule],
      },
      noticeSent: {
        ...base,
        events: EVENTS_WITH_NOTICE,
        rawProposals: [instructorPostMeetingRule],
        rawConformanceRules: [notificationRule, materialsRule],
      },
      // The over-claim: a binding student MUST proposed over UB's bare,
      // modal-free statement of the same period.
      studentWindowOverclaimed: {
        ...base,
        events: EVENTS_WITH_NOTICE,
        rawProposals: [studentWindowAsMustRule],
      },
    };
  },

  expectations: [
    {
      id: "ub-missing-notification-nonconformant",
      run: "noticeNeverSent",
      semanticFeature:
        "A required actor-specific step that never happened, where a later observed event closes the window",
      expected: "NONCONFORMANT, attributed to the instructor, because the hearing was held with no notification on record",
      shortcutRisk: "Reporting only what the student failed to do, and never checking the instructor's own first step.",
      check: (r) => {
        const f = r.conformance.find((c) => c.ruleId === "ub-instructor-written-notification");
        const rule = r.conformanceRules.validated.find((x) => x.id === "ub-instructor-written-notification");
        return expectTrue(
          f?.status === "NONCONFORMANT" && rule?.actor === "instructor",
          `${f?.status ?? "no finding"} (actor: ${rule?.actor ?? "n/a"})`
        );
      },
    },
    {
      id: "ub-open-window-undetermined",
      run: "beforeHearing",
      semanticFeature: "Absence of a required event is never a violation while its window is still open",
      expected: "UNDETERMINED at 2026-03-10, with the hearing not yet held",
      shortcutRisk:
        "Telling a student the university has already violated procedure, weeks before the step was even due to happen.",
      check: (r) => {
        const f = r.conformance.find((c) => c.ruleId === "ub-instructor-written-notification");
        return expectTrue(f?.status === "UNDETERMINED", `${f?.status ?? "no finding"}: ${f?.reason ?? ""}`);
      },
    },
    {
      id: "ub-chained-clock-blocked-on-missing-step",
      run: "noticeNeverSent",
      semanticFeature: "Actor-chained process: the instructor's Step 3 clock is anchored on the consultative meeting",
      expected:
        "The obligation is 'unknown' with no invented due date, because the triggering consultative meeting never occurred",
      shortcutRisk:
        "Inventing a start date for the window (e.g. from the incident date) so that a number can be reported.",
      check: (r) => {
        const o = r.caseState.obligations.find((x) => x.obligationId === "ub-instructor-post-meeting-decision");
        return expectTrue(
          o?.status === "unknown" && o.dueAt === null,
          `status ${o?.status ?? "n/a"}, due ${o?.dueAt ?? "null"}: ${o?.reason ?? ""}`
        );
      },
    },
    {
      id: "ub-chain-resolves-once-step-occurs",
      run: "noticeSent",
      semanticFeature: "The same chained clock resolves once the upstream actor's step is recorded",
      expected: "Notification CONFORMANT, and the instructor's Step 3 deadline computes to 2026-03-18",
      shortcutRisk: "Hard-coding an outcome rather than deriving it from the trace.",
      check: (r) => {
        const f = r.conformance.find((c) => c.ruleId === "ub-instructor-written-notification");
        const o = r.caseState.obligations.find((x) => x.obligationId === "ub-instructor-post-meeting-decision");
        return expectTrue(
          f?.status === "CONFORMANT" && o?.dueAt === "2026-03-18",
          `notification ${f?.status ?? "n/a"}; instructor Step 3 due ${o?.dueAt ?? "null"}`
        );
      },
    },
    {
      id: "ub-modal-free-window-not-promoted-to-must",
      run: "studentWindowOverclaimed",
      semanticFeature:
        "Deontic support: a bare period with no modal verb does not license a binding obligation against the student",
      expected:
        "Held for human review with no obligation compiled — UB says students HAVE 10 academic days, and says the instructor may decide without them if they do not use it; it never says the student MUST",
      shortcutRisk:
        "Turning every number in a procedure into a student deadline. The quote is verbatim correct, the source id is right, the hash is right — and the obligation is still an over-claim against the person with the least power in the process.",
      check: (r) =>
        expectTrue(
          r.rules.validated.length === 0 &&
            r.rules.needsReview.length === 1 &&
            r.caseState.obligations.length === 0,
          `${r.rules.validated.length} validated, ${r.rules.needsReview.length} in review, ${r.caseState.obligations.length} obligation(s)`
        ),
    },
    {
      id: "ub-materials-lead-time-nonconformant",
      run: "noticeNeverSent",
      semanticFeature: "A short, sub-week lead time (72 hours) expressed in calendar days",
      expected: "NONCONFORMANT — materials shared 2026-03-22, hearing 2026-03-23",
      shortcutRisk: "Rounding a 72-hour requirement into 'about three days' and calling it satisfied.",
      check: (r) => {
        const f = r.conformance.find((c) => c.ruleId === "ub-materials-72-hours");
        return expectTrue(f?.status === "NONCONFORMANT", `${f?.status ?? "no finding"}: ${f?.reason ?? ""}`);
      },
    },
  ],
};

export const UB_EVIDENCE = { Q_INSTRUCTOR_NOTIFY, Q_STUDENT_MEETING_WINDOW, Q_MATERIALS_LEAD_TIME, Q_ACADEMIC_DAYS_DEFINED };
