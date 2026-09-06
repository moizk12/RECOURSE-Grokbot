import type { BenchCase } from "../benchCase.ts";
import { expectTrue } from "../benchCase.ts";
import type { PolicySource } from "../../src/types/authority.ts";
import type { CaseEvent } from "../../src/types/case.ts";

const SOURCE_ID = "umn-complaint-guidelines";
const URL = "https://policy.umn.edu/education/studentcomplaints-appa";

/** Verbatim spans from the pinned HTML capture. */
const Q_DISCLAIMER = "They do not establish procedural rights or impose obligations.";

const Q_MAY = "A fair hearing process may include the following";

/**
 * The trap. This guidance document contains a hard number that reads exactly
 * like a binding institutional deadline -- and is not one.
 */
const Q_TEN_BUSINESS_DAYS =
  "The Dean's decision should follow promptly on receipt of the panel’s recommendation, within 10 business days.";

const source: PolicySource = {
  sourceId: SOURCE_ID,
  institution: "University of Minnesota",
  authorityLevel: "campus_wide",
  scope: { institution: "University of Minnesota", decisionTypes: ["student_academic_complaint"] },
  effective: { effectiveDate: "2026-01-01" },
};

const EVENTS: CaseEvent[] = [
  { eventId: "umn-e1", type: "case_opened", occurredAt: "2026-03-02T09:00:00Z", detail: { synthetic: true } },
  { eventId: "umn-e2", type: "grievance_filed", occurredAt: "2026-03-02T09:00:00Z", detail: { synthetic: true } },
  {
    eventId: "umn-e3",
    type: "institution_action_taken",
    occurredAt: "2026-03-04T09:00:00Z",
    detail: { synthetic: true, note: "panel recommendation submitted to the Dean" },
  },
];

/** The shortcut: reading "within 10 business days" as a binding institutional deadline. */
const bindingDeadlineProposal = {
  rule: {
    id: "umn-dean-decision-deadline",
    policyId: "umn-complaint-guidelines",
    kind: "obligation" as const,
    provenance: {
      sourceUrl: URL,
      retrievedAt: "2026-03-02T00:00:00Z",
      sourceSpan: Q_TEN_BUSINESS_DAYS,
      actor: "institution",
    },
    actor: "institution",
    action: "issue_dean_decision",
    trigger: { eventType: "institution_action_taken" },
    conditions: [],
    deonticForce: "MUST" as const,
    deadline: {
      type: "relative" as const,
      amount: 10,
      unit: "business_day" as const,
      fromEvent: "institution_action_taken",
    },
  },
  sourceId: SOURCE_ID,
  quotedText: Q_TEN_BUSINESS_DAYS,
  claimType: "directly_stated" as const,
};

/** The honest encoding of the same sentence: SHOULD, not MUST. */
const advisoryProposal = {
  ...bindingDeadlineProposal,
  rule: { ...bindingDeadlineProposal.rule, id: "umn-dean-decision-advisory", deonticForce: "SHOULD" as const },
};

/**
 * The guidance document's own disclaimer, used as the warrant for a
 * GUIDANCE_FOR lineage edge. Note what is being warranted: not "someone
 * thinks this page is non-binding", but the page's own sentence saying so.
 */
const guidanceEdge = {
  relationship: {
    id: "umn-guidelines-are-guidance",
    type: "GUIDANCE_FOR" as const,
    fromSourceId: SOURCE_ID,
    toSourceId: "umn-student-complaints-policy",
  },
  quotedText: Q_DISCLAIMER,
  claimType: "directly_stated" as const,
};

export const umnGuidanceNotBinding: BenchCase = {
  id: "umn-guidance-not-binding",
  institution: "University of Minnesota",
  procedure: "Guidelines for Colleges: Hearings Under the Conflict Resolution Process for Student Academic Complaints",
  sourceIds: [SOURCE_ID],
  sourceUrls: [URL],
  notes: [
    "This is the suite's negative case. The document states in its own first paragraph: \"They do not establish procedural rights or impose obligations.\" It nonetheless contains hard numbers (\"within 10 business days\") that a naive extractor will read as binding deadlines.",
    "The page carries no effective or revision date -- only a print stamp. That is recorded in the source metadata as a known limitation: this document cannot be version-pinned the way the other four can.",
    "The referenced parent policy (toSourceId) is not itself captured here. The GUIDANCE_FOR edge is warranted by the guidance document's own disclaimer, which is the evidence that matters for this test.",
  ],

  runs: (sources) => {
    const base = {
      caseId: "bench-umn-guidance",
      evaluationAt: "2026-04-01T00:00:00Z",
      dataMarker: "synthetic",
      sources: [...sources],
      policySources: [source],
      authorityQuery: { institution: "University of Minnesota", decisionType: "student_academic_complaint" },
      events: EVENTS,
    };

    return {
      // Layer 1: the document's own disclaimer, validated, disqualifies it as a governing source.
      guidanceRecognized: {
        ...base,
        rawRelationships: [guidanceEdge],
        rawProposals: [bindingDeadlineProposal],
      },
      // Layer 2: even with no lineage edge asserted at all, honest modality
      // keeps a "should" out of the binding obligation set.
      modalityPreserved: { ...base, rawProposals: [advisoryProposal] },
      // The shortcut, with no guidance edge: MUST asserted over "should" text.
      // Recourse cannot detect this from the span alone -- see expectation.
      unguardedShortcut: { ...base, rawProposals: [bindingDeadlineProposal] },
    };
  },

  expectations: [
    {
      id: "umn-guidance-cannot-govern",
      run: "guidanceRecognized",
      semanticFeature:
        "A document that states it does not establish rights or impose obligations can never be a governing source",
      expected:
        "Authority resolution blocks with no governing source, and the binding-deadline rule does not compile despite a verbatim-correct quote",
      shortcutRisk:
        "Compiling official-looking university guidance into student and institutional deadlines — the single most likely way to give a student a confidently wrong answer about their rights.",
      check: (r) =>
        expectTrue(
          r.authority.status === "BLOCKED_SOURCE_UNAVAILABLE" &&
            r.rules.validated.length === 0 &&
            r.caseState.obligations.length === 0,
          `authority ${r.authority.status}; ${r.rules.validated.length} rule(s); ${r.caseState.obligations.length} obligation(s)`
        ),
    },
    {
      id: "umn-disclaimer-is-warranted-not-assumed",
      run: "guidanceRecognized",
      semanticFeature: "The non-binding status is established by the document's own quoted sentence",
      expected: "The GUIDANCE_FOR edge validates, carrying the disclaimer sentence as its warrant",
      shortcutRisk: "Guessing a document is non-binding from its title or URL rather than from its text.",
      check: (r) => {
        const edge = r.relationships.validated.find((x) => x.id === "umn-guidelines-are-guidance");
        return expectTrue(
          edge?.type === "GUIDANCE_FOR" && edge.quotedText === Q_DISCLAIMER,
          edge ? `${edge.type} warranted by: ${edge.quotedText}` : "edge not validated"
        );
      },
    },
    {
      id: "umn-modality-preserved",
      run: "modalityPreserved",
      semanticFeature: "SHOULD is not silently upgraded to MUST",
      expected: "The rule validates as advisory, produces no obligation, and gates no case state",
      shortcutRisk: "Normalizing every temporal statement in a procedure into an enforceable deadline.",
      check: (r) =>
        expectTrue(
          r.advisoryRules.some((x) => x.id === "umn-dean-decision-advisory") && r.caseState.obligations.length === 0,
          `${r.advisoryRules.length} advisory rule(s); ${r.caseState.obligations.length} obligation(s)`
        ),
    },
    {
      id: "umn-span-check-alone-is-insufficient",
      run: "unguardedShortcut",
      semanticFeature:
        "Documented limit: warrant validation alone cannot detect a MUST asserted over SHOULD text; only the authority layer stops it",
      expected:
        "With no GUIDANCE_FOR edge asserted, the rule DOES compile — which is why the guidance edge in the first run is load-bearing, and why this limitation is recorded rather than hidden",
      shortcutRisk:
        "Claiming the warrant layer catches modality drift. It does not: the quoted span is genuinely present, and a deontic mismatch is a semantic judgement no span check can make.",
      check: (r) =>
        expectTrue(
          r.rules.validated.length === 1 && r.caseState.obligations.length === 1,
          `${r.rules.validated.length} rule(s) compiled without the guidance edge — limitation confirmed, not a regression`
        ),
    },
  ],
};

export const UMN_EVIDENCE = { Q_DISCLAIMER, Q_MAY, Q_TEN_BUSINESS_DAYS };
