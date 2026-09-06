import type { BenchCase } from "../benchCase.ts";
import { expectTrue } from "../benchCase.ts";
import type { PolicySource } from "../../src/types/authority.ts";
import type { CaseEvent } from "../../src/types/case.ts";

const SOURCE_ID = "auburn-academic-integrity";
const URL =
  "https://www.auburn.edu/academic/provost/academic-integrity/_assets/pdf/Academic-Integrity-Policy-FINAL-SP2026.pdf";

/** Verbatim spans from the pinned PDF capture. */
const Q_GROUNDS =
  "Appeals may only be considered if:\n• \tNew evidence or information is discovered that could potentially impact the\ndecision. This new information must have been unknown to the person appealing\nat the time of the original Hearing.\n• \tProper procedure for a Hearing was not followed.\n• \tThe proposed sanctions are considered disproportionate in comparison with the\nviolations committed.";

const Q_ONLY = "Appeals may only be considered if";

const Q_FILING_PERIOD =
  "An appeal must be submitted to the Office of the Provost within five business days of\nnotification using the online Academic Integrity Appeal Form.";

const source: PolicySource = {
  sourceId: SOURCE_ID,
  institution: "Auburn University",
  authorityLevel: "campus_wide",
  scope: { institution: "Auburn University", decisionTypes: ["academic_integrity_appeal"] },
  effective: { effectiveDate: "2026-01-01", versionId: "revised 1/01/2026" },
};

/** Synthetic student: found in violation Monday 2026-03-02, asserts a ground. */
function events(groundId: string): CaseEvent[] {
  return [
    { eventId: "au-e1", type: "case_opened", occurredAt: "2026-03-02T09:00:00Z", detail: { synthetic: true } },
    {
      eventId: "au-e2",
      type: "decision_notice_received",
      occurredAt: "2026-03-02T09:00:00Z",
      detail: { synthetic: true },
    },
    { eventId: "au-e3", type: "ground_asserted", occurredAt: "2026-03-03T09:00:00Z", detail: { groundId } },
  ];
}

const groundsRule = (closure: "CLOSED" | "OPEN_EXAMPLES", withEvidence: boolean) => ({
  rule: {
    id: "auburn-appeal-grounds",
    policyId: "auburn-academic-integrity",
    kind: "eligibility_grounds" as const,
    provenance: {
      sourceUrl: URL,
      retrievedAt: "2026-03-02T00:00:00Z",
      sourceSpan: Q_GROUNDS,
      actor: "student",
    },
    actor: "student",
    action: "assert_appeal_ground",
    trigger: { eventType: "decision_notice_received" },
    conditions: [],
    deonticForce: "MUST" as const,
    groundsList: {
      ids: ["new_evidence", "procedure_not_followed", "sanction_disproportionate"],
      closure,
      ...(withEvidence ? { exhaustivenessEvidence: Q_ONLY } : {}),
    },
    groundsPolarity: "valid" as const,
  },
  sourceId: SOURCE_ID,
  quotedText: Q_GROUNDS,
  claimType: "directly_stated" as const,
});

const filingRule = {
  rule: {
    id: "auburn-appeal-filing",
    policyId: "auburn-academic-integrity",
    kind: "obligation" as const,
    provenance: {
      sourceUrl: URL,
      retrievedAt: "2026-03-02T00:00:00Z",
      sourceSpan: Q_FILING_PERIOD,
      actor: "student",
    },
    actor: "student",
    action: "submit_appeal",
    trigger: { eventType: "decision_notice_received" },
    conditions: [],
    deonticForce: "MUST" as const,
    deadline: {
      type: "relative" as const,
      amount: 5,
      unit: "business_day" as const,
      fromEvent: "decision_notice_received",
    },
  },
  sourceId: SOURCE_ID,
  quotedText: Q_FILING_PERIOD,
  claimType: "directly_stated" as const,
};

export const auburnAppealGrounds: BenchCase = {
  id: "auburn-appeal-grounds",
  institution: "Auburn University",
  procedure: "Academic Integrity Policy — appeal",
  sourceIds: [SOURCE_ID],
  sourceUrls: [URL],
  notes: [
    "Retargeted during this pass: the former Academic Honesty Code PDF now returns HTTP 404 and /academic-honesty/ redirects to /academic-integrity/. The current policy says five BUSINESS days; the \"five class days\" figure that circulates in third-party summaries is not in the current source.",
    "The canonical HTML rendering of this policy is JavaScript-rendered and returns an effectively empty document to a plain HTTP GET, so the benchmark pins the authoritative PDF.",
    "Auburn's exhaustiveness token is \"Appeals may only be considered if\" — a restriction on consideration rather than the phrasing \"these are the only grounds\". It is an affirmative closure statement, which is what CLOSED requires; the distinction is recorded here rather than smoothed over.",
  ],

  runs: (sources) => {
    const base = {
      caseId: "bench-auburn-appeal",
      evaluationAt: "2026-03-06T00:00:00Z",
      dataMarker: "synthetic",
      sources: [...sources],
      policySources: [source],
      authorityQuery: { institution: "Auburn University", decisionType: "academic_integrity_appeal" },
      events: events("new_evidence"),
    };

    return {
      // Honest encoding: closure CLOSED, backed by the affirmative "may only" quote.
      supportedClosure: { ...base, rawProposals: [groundsRule("CLOSED", true), filingRule] },
      // A ground the source does not enumerate, against the closed list.
      unlistedGround: {
        ...base,
        rawProposals: [groundsRule("CLOSED", true), filingRule],
        events: events("i_disagree_with_the_grade"),
      },
      // The shortcut: asserting CLOSED with no exhaustiveness evidence at all.
      unsupportedClosure: { ...base, rawProposals: [{ ...groundsRule("CLOSED", false) }] },
      // An enumerated list with no closure claim: unlisted grounds must fail to review, not to a confident refusal.
      openList: {
        ...base,
        rawProposals: [groundsRule("OPEN_EXAMPLES", false)],
        events: events("i_disagree_with_the_grade"),
      },
      // Filing window: 5 business days from Monday 2026-03-02 is 2026-03-09.
      lateFiling: { ...base, evaluationAt: "2026-03-11T00:00:00Z", rawProposals: [filingRule] },
    };
  },

  expectations: [
    {
      id: "auburn-closed-list-supported",
      run: "supportedClosure",
      semanticFeature: "Closed appeal-ground list, backed by an affirmative exhaustiveness quote",
      expected: "The grounds rule validates with closure CLOSED, and the asserted enumerated ground is found eligible",
      shortcutRisk: "Treating any enumerated list as exhaustive by default.",
      check: (r) => {
        const rule = r.rules.validated.find((x) => x.id === "auburn-appeal-grounds");
        return expectTrue(
          rule?.groundsList?.closure === "CLOSED" && r.caseState.eligibility.result === "eligible",
          `closure ${rule?.groundsList?.closure ?? "not validated"}; eligibility ${r.caseState.eligibility.result}`
        );
      },
    },
    {
      id: "auburn-five-business-days",
      run: "supportedClosure",
      semanticFeature: "Five-business-day filing period",
      expected: "Appeal due 2026-03-09 (5 business days after Monday 2026-03-02), pending at 2026-03-06",
      shortcutRisk:
        "Using the widely-repeated \"five class days\" figure from third-party summaries, or counting calendar days.",
      check: (r) => {
        const o = r.caseState.obligations.find((x) => x.obligationId === "auburn-appeal-filing");
        return expectTrue(o?.dueAt === "2026-03-09" && o?.status === "pending", `due ${o?.dueAt ?? "—"} (${o?.status ?? "n/a"})`);
      },
    },
    {
      id: "auburn-new-evidence-ground",
      run: "supportedClosure",
      semanticFeature: "\"New evidence\" is one of the source-supported grounds",
      expected: "new_evidence appears in the validated grounds list",
      shortcutRisk: "Inventing plausible-sounding grounds the policy does not list.",
      check: (r) => {
        const rule = r.rules.validated.find((x) => x.id === "auburn-appeal-grounds");
        return expectTrue(
          rule?.groundsList?.ids.includes("new_evidence") === true,
          `grounds ${JSON.stringify(rule?.groundsList?.ids ?? [])}`
        );
      },
    },
    {
      id: "auburn-unlisted-ground-against-closed-list",
      run: "unlistedGround",
      semanticFeature: "A ground outside a genuinely closed list",
      expected: "Eligibility is ineligible, citing the closed exhaustive list — a conclusion the source actually licenses",
      shortcutRisk: "Being agreeable and admitting any sympathetic-sounding ground.",
      check: (r) =>
        expectTrue(
          r.caseState.eligibility.result === "ineligible",
          `${r.caseState.eligibility.result}: ${r.caseState.eligibility.reason}`
        ),
    },
    {
      id: "auburn-unsupported-closure-refused",
      run: "unsupportedClosure",
      semanticFeature: "CLOSED asserted with no exhaustiveness evidence",
      expected: "The rule is rejected at validation; no grounds list becomes executable",
      shortcutRisk:
        "Asserting exhaustiveness because the list simply did not say 'or other good cause' — an inference, not a quote.",
      check: (r) =>
        expectTrue(
          r.rules.validated.length === 0 && r.rules.rejected.length > 0,
          `${r.rules.validated.length} validated, ${r.rules.rejected.length} rejected`
        ),
    },
    {
      id: "auburn-open-list-fails-to-review",
      run: "openList",
      semanticFeature: "An unlisted ground against a list not proven exhaustive",
      expected: "Eligibility is undetermined (human review), NOT a confident ineligible",
      shortcutRisk:
        "Telling a student they have no grounds, on the strength of a list nobody established was complete.",
      check: (r) =>
        expectTrue(
          r.caseState.eligibility.result === "undetermined",
          `${r.caseState.eligibility.result}: ${r.caseState.eligibility.reason}`
        ),
    },
    {
      id: "auburn-filing-window-missed",
      run: "lateFiling",
      semanticFeature: "Filing window evaluated at an explicit later instant",
      expected: "At 2026-03-11 the appeal obligation is missed, with the same due date as at 2026-03-06",
      shortcutRisk: "Re-deriving a different due date because the question was asked on a different day.",
      check: (r) => {
        const o = r.caseState.obligations.find((x) => x.obligationId === "auburn-appeal-filing");
        return expectTrue(o?.dueAt === "2026-03-09" && o?.status === "missed", `due ${o?.dueAt ?? "—"} (${o?.status ?? "n/a"})`);
      },
    },
  ],
};
