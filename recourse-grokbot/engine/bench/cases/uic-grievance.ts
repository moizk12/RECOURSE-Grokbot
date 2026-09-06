import type { BenchCase } from "../benchCase.ts";
import { expectTrue } from "../benchCase.ts";
import type { PolicySource } from "../../src/types/authority.ts";
import type { CaseEvent } from "../../src/types/case.ts";

const SOURCE_ID = "uic-academic-grievance";
const URL =
  "https://oae.uic.edu/wp-content/uploads/sites/32/2019/10/UIC_Student_Academic_Grievance_Procedures-and-Forms_FINAL_Sept-2019.pdf";

/**
 * Verbatim spans from the pinned PDF capture. Line breaks are exactly where
 * the extractor put them -- these strings are checked character-for-character
 * against the captured content, so they cannot be "tidied up".
 */
const Q_AO_DECISION =
  "The Administrative Officer’s decision must be issued in\nwriting, within ten (10) days following their receipt of the Academic Grievance.";

const Q_RECEIVED_OR_DUE =
  "Limitations imposed upon the Grievant for filing appeals of\ndecisions will be calculated from the date that any decision is received by the Grievant,\nor is due, whichever date is earlier.";

/**
 * The provision that makes the Grievant's next step BINDING. It is a
 * different sentence from the one establishing the anchor semantics above,
 * which is the ordinary shape of institutional drafting: one clause says when
 * the clock starts, another says the step is required at all. Supplied as the
 * student rule's `forceEvidence` so validation/deonticSupport.ts has real,
 * verified, binding language to check the claimed MUST against, rather than
 * the anchor clause's modal-free "will be calculated".
 */
const Q_STUDENT_REQUEST_REQUIRED =
  "The Grievant’s request for a Formal Hearing must be submitted, in writing,";

const Q_DAYS_ARE_BUSINESS_DAYS =
  "All references in these Procedures to a time period are to working or business\ndays. Official University holidays are not considered business days.";

const source: PolicySource = {
  sourceId: SOURCE_ID,
  institution: "University of Illinois Chicago",
  authorityLevel: "campus_wide",
  scope: { institution: "University of Illinois Chicago", decisionTypes: ["academic_grievance"] },
  effective: { effectiveDate: "2017-04-27", versionId: "Sept 2019 forms packet" },
};

/**
 * Synthetic student, invented for this benchmark. A grievance is filed on
 * Monday 2026-03-02 and then nothing happens: the university does not
 * respond, and the student receives no decision.
 */
const EVENTS: CaseEvent[] = [
  { eventId: "uic-e1", type: "case_opened", occurredAt: "2026-03-02T09:00:00Z", detail: { synthetic: true } },
  { eventId: "uic-e2", type: "grievance_filed", occurredAt: "2026-03-02T09:00:00Z", detail: { synthetic: true } },
];

export const uicGrievance: BenchCase = {
  id: "uic-grievance",
  institution: "University of Illinois Chicago",
  procedure: "Student Academic Grievance Procedures",
  sourceIds: [SOURCE_ID],
  sourceUrls: [URL],
  notes: [
    "The document defines its own day unit: \"All references in these Procedures to a time period are to working or business days.\" That definition is a separate provision from either deadline, and the current rule IR carries one warrant per rule, so the business_day unit on each deadline below is supported by a provision quoted in this case's evidence list but not by the individual rule's own warrant span. Recorded here rather than glossed over.",
    "The student's next-stage window and the derived earliest-of anchor come from two provisions in the same document. The rule's own warrant is the received-or-due clause, which is what licenses the anchor semantics; the clause that makes the step binding (\"The Grievant's request for a Formal Hearing must be submitted, in writing,\") is supplied separately as forceEvidence and is verified to the identical standard. Without it the deontic-support gate would hold this rule for review, because \"will be calculated\" is not binding language — which is the correct, fail-closed behaviour and the reason the second quotation exists.",
  ],

  runs: (sources) => {
    const base = {
      caseId: "bench-uic-grievance",
      dataMarker: "synthetic",
      sources: [...sources],
      policySources: [source],
      authorityQuery: {
        institution: "University of Illinois Chicago",
        decisionType: "academic_grievance",
      },
      rawProposals: [
        {
          rule: {
            id: "uic-ao-decision",
            policyId: "uic-academic-grievance",
            kind: "obligation" as const,
            provenance: {
              sourceUrl: URL,
              retrievedAt: "2026-03-02T00:00:00Z",
              sourceSpan: Q_AO_DECISION,
              actor: "institution",
            },
            actor: "institution",
            action: "issue_administrative_officer_decision",
            trigger: { eventType: "grievance_filed" },
            conditions: [],
            deonticForce: "MUST" as const,
            deadline: {
              type: "relative" as const,
              amount: 10,
              unit: "business_day" as const,
              fromEvent: "grievance_filed",
            },
          },
          sourceId: SOURCE_ID,
          quotedText: Q_AO_DECISION,
          claimType: "directly_stated" as const,
        },
        {
          rule: {
            id: "uic-student-request-hearing",
            policyId: "uic-academic-grievance",
            kind: "obligation" as const,
            provenance: {
              sourceUrl: URL,
              retrievedAt: "2026-03-02T00:00:00Z",
              sourceSpan: Q_RECEIVED_OR_DUE,
              actor: "student",
            },
            actor: "student",
            action: "request_formal_hearing",
            trigger: { eventType: "grievance_filed" },
            conditions: [],
            deonticForce: "MUST" as const,
            // "from the date that any decision is received by the Grievant,
            // OR IS DUE, whichever date is earlier" -- two anchors, earliest.
            deadline: {
              type: "derived" as const,
              amount: 10,
              unit: "business_day" as const,
              combinator: "earliest" as const,
              anchors: [{ fromEvent: "decision_notice_received" }, { fromObligationDue: "uic-ao-decision" }],
            },
          },
          sourceId: SOURCE_ID,
          quotedText: Q_RECEIVED_OR_DUE,
          claimType: "directly_stated" as const,
          forceEvidence: { quotedText: Q_STUDENT_REQUEST_REQUIRED, claimType: "directly_stated" as const },
        },
      ],
      events: EVENTS,
    };

    return {
      // 2026-03-10: both clocks running, nothing missed yet.
      early: { ...base, evaluationAt: "2026-03-10T00:00:00Z" },
      // 2026-03-18: the institution's own 10-business-day clock has expired.
      afterInstitutionDeadline: { ...base, evaluationAt: "2026-03-18T00:00:00Z" },
      // A proposal citing this same, correctly quoted document for a
      // DIFFERENT institution's decision type.
      wrongScope: {
        ...base,
        evaluationAt: "2026-03-18T00:00:00Z",
        authorityQuery: {
          institution: "University of Illinois Chicago",
          decisionType: "student_conduct_suspension",
        },
      },
      forecastRun: {
        ...base,
        evaluationAt: "2026-03-10T00:00:00Z",
        forecast: [
          {
            id: "uic-no-action-through-institution-deadline",
            kind: "NO_NEW_EVENTS" as const,
            evaluationAt: "2026-03-18T00:00:00Z",
            assumptions: ["no party takes any further action"],
          },
          {
            id: "uic-no-action-through-student-deadline",
            kind: "NO_NEW_EVENTS" as const,
            evaluationAt: "2026-04-02T00:00:00Z",
            assumptions: ["no party takes any further action"],
          },
        ],
      },
    };
  },

  expectations: [
    {
      id: "uic-two-clocks",
      run: "early",
      semanticFeature: "Two-sided clocks: the institution carries a deadline of its own, not only the student",
      expected:
        "Both a student obligation and an institution obligation are validated and given computed due dates from the same trace",
      shortcutRisk:
        "A summarizer typically reports only what the STUDENT must do by when; the institution's own deadline is the half that gets dropped.",
      check: (r) => {
        const inst = r.caseState.obligations.find((o) => o.party === "institution");
        const stu = r.caseState.obligations.find((o) => o.party === "student");
        return expectTrue(
          !!inst?.dueAt && !!stu?.dueAt,
          `institution ${inst?.obligationId ?? "none"} due ${inst?.dueAt ?? "—"}; student ${stu?.obligationId ?? "none"} due ${stu?.dueAt ?? "—"}`
        );
      },
    },
    {
      id: "uic-business-day-arithmetic",
      run: "early",
      semanticFeature: "Business-day arithmetic over the institution's 10-day response window",
      expected: "Institution decision due 2026-03-16 (10 business days after Monday 2026-03-02), not 2026-03-12",
      shortcutRisk: "Counting 10 calendar days, or counting the filing day itself as day 1.",
      check: (r) => {
        const inst = r.caseState.obligations.find((o) => o.obligationId === "uic-ao-decision");
        return expectTrue(inst?.dueAt === "2026-03-16", `due ${inst?.dueAt ?? "not computed"}`);
      },
    },
    {
      id: "uic-derived-trigger-from-due-date",
      run: "early",
      semanticFeature:
        "Derived trigger: the student's window runs from the decision RECEIVED or DUE, whichever is earlier",
      expected:
        "The student's deadline resolves to 2026-03-30 from the institution's own due date, even though no decision has ever been received",
      shortcutRisk:
        "Reporting the student's clock as 'not started' because no decision notice exists -- which is exactly the reading that costs a student the appeal window when the university goes silent.",
      check: (r) => {
        const stu = r.caseState.obligations.find((o) => o.obligationId === "uic-student-request-hearing");
        return expectTrue(
          stu?.dueAt === "2026-03-30" && stu?.status !== "unknown",
          `student deadline ${stu?.dueAt ?? "unresolved"} (${stu?.status ?? "n/a"}): ${stu?.reason ?? ""}`
        );
      },
    },
    {
      id: "uic-institution-deadline-exceeded",
      run: "afterInstitutionDeadline",
      semanticFeature: "The institution's missed deadline is reported as a deviation attributed to the institution",
      expected: "INSTITUTION_DEADLINE_EXCEEDED at evaluation instant 2026-03-18, with the student's clock still pending",
      shortcutRisk: "Attributing every missed step to the student, or treating institutional silence as 'in progress'.",
      check: (r) => {
        const dev = r.deviations.find((d) => d.type === "INSTITUTION_DEADLINE_EXCEEDED");
        const stu = r.caseState.obligations.find((o) => o.obligationId === "uic-student-request-hearing");
        return expectTrue(
          !!dev && stu?.status === "pending",
          `${dev ? "INSTITUTION_DEADLINE_EXCEEDED" : "no institution deviation"}; student status ${stu?.status ?? "n/a"}`
        );
      },
    },
    {
      id: "uic-wrong-decision-type-refused",
      run: "wrongScope",
      semanticFeature: "Applicability: a correctly quoted grievance procedure does not govern a conduct suspension",
      expected: "Authority resolution blocks, and no rule compiles, despite every quote being verbatim correct",
      shortcutRisk:
        "Quoting the right university's real policy for the wrong kind of decision -- the failure mode that looks most convincing, because every citation checks out.",
      check: (r) =>
        expectTrue(
          r.authority.status === "BLOCKED_SOURCE_UNAVAILABLE" && r.rules.validated.length === 0,
          `authority ${r.authority.status}, ${r.rules.validated.length} rule(s) compiled`
        ),
    },
    {
      id: "uic-forecast-two-stage",
      run: "forecastRun",
      semanticFeature: "Forecast: the case's evolution under NO_NEW_EVENTS across both deadlines",
      expected:
        "At 2026-03-18 the institution's deadline is newly missed; at 2026-04-02 the student's derived deadline is newly missed as well",
      shortcutRisk: "Predicting institutional behaviour rather than evaluating the procedure at a stated instant.",
      check: (r) => {
        const [first, second] = r.forecast;
        if (first?.status !== "evaluated" || second?.status !== "evaluated") {
          return expectTrue(false, "forecast scenarios did not evaluate");
        }
        const instMissed = first.changes.some(
          (c) => c.kind === "obligation_status" && c.obligationId === "uic-ao-decision" && c.to === "missed"
        );
        const stuMissed = second.changes.some(
          (c) => c.kind === "obligation_status" && c.obligationId === "uic-student-request-hearing" && c.to === "missed"
        );
        return expectTrue(
          first.outcome === "NEW_DEVIATION_DETECTED" && instMissed && second.outcome === "NEW_DEVIATION_DETECTED" && stuMissed,
          `2026-03-18: ${first.outcome} (institution missed: ${instMissed}); 2026-04-02: ${second.outcome} (student missed: ${stuMissed})`
        );
      },
    },
  ],
};

export const UIC_EVIDENCE = { Q_AO_DECISION, Q_RECEIVED_OR_DUE, Q_STUDENT_REQUEST_REQUIRED, Q_DAYS_ARE_BUSINESS_DAYS };
