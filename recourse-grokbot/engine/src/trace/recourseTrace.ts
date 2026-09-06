import { createHash } from "node:crypto";
import type { AnalyzeCaseResult } from "../cli/analyzeCase.ts";
import type { CaseEvent, ObligationState } from "../types/case.ts";
import type { ConformanceConstraint } from "../types/conformance.ts";
import type { EvidenceWarrant } from "../types/warrant.ts";
import type { SourceProvenance } from "../cli/resolveCase.ts";
import type { ForecastPoint } from "../forecast/forecast.ts";

/**
 * The Recourse Trace: the reviewable proof trail for one completed analysis.
 *
 * This is not a summary and not a narrative. It is the record a student can
 * hand to an advisor, an ombuds office, or a hearing panel, containing every
 * fact the conclusion rests on: which documents were fetched and what they
 * hashed to, which document was established as governing and on what quoted
 * authority, which proposed claims became executable and which were refused
 * and why, what the case's append-only event trace actually contains, what
 * the validated procedure implies about it, and -- explicitly -- what could
 * not be determined.
 *
 * Everything in a trace is derived deterministically from an AnalyzeCaseResult.
 * There is no field here that requires a judgment call, and no field a model
 * fills in.
 */
export const TRACE_VERSION = 2;

/**
 * Stated on every trace, machine-readable and rendered into the Markdown, so
 * a reader who sees only one artifact still sees the limit of what it claims.
 */
export const TRACE_BOUNDARY_STATEMENT =
  "Recourse compares a published institutional procedure against the recorded events of one case. " +
  "It does not infer a remedy, a legal entitlement, guilt, innocence, or any guaranteed institutional outcome. " +
  "A finding in this record states only whether an observed process matches a procedural rule that was validated against " +
  "quoted text in the governing source; where the record is incomplete, the finding is UNDETERMINED rather than " +
  "resolved in either party's favour. This is a procedural record, not legal advice.";

export type ClaimKind = "source_relationship" | "policy_rule" | "conformance_rule";

export interface TraceValidatedClaim {
  readonly claimId: string;
  readonly kind: ClaimKind;
  readonly sourceId: string;
  readonly claimType: EvidenceWarrant["claimType"];
  readonly quotedText: string;
  readonly span: { readonly start: number; readonly end: number };
  readonly contentHash: string;
}

export interface TraceRejectedClaim {
  readonly claimId: string;
  readonly kind: ClaimKind;
  readonly field: string;
  readonly reason: string;
}

export interface TraceReviewClaim {
  readonly claimId: string;
  readonly kind: ClaimKind;
  readonly reason: string;
}

export interface TraceObligation {
  readonly obligationId: string;
  readonly party: ObligationState["party"];
  readonly actor: string;
  readonly action: string;
  readonly deonticForce: string;
  readonly trigger: string | null;
  readonly deadline: unknown;
  readonly dueAt: string | null;
  readonly status: ObligationState["status"];
  readonly reason: string;
  readonly sourceUrl: string;
  readonly sourceSpan: string;
}

export interface TraceFinding {
  readonly ruleId: string;
  readonly actor: string;
  readonly expected: string;
  readonly observedEvents: ReadonlyArray<{ readonly eventId: string; readonly type: string; readonly occurredAt: string }>;
  readonly status: string;
  /** The engine's own computation, verbatim -- including any computed boundary date. */
  readonly calculation: string;
  /**
   * Present only where the governing source attaches a waiver or exception to
   * this requirement. Reported as its own dimension rather than folded into
   * `status`, because "violated", "excused by a stated exception" and "the
   * record does not say whether the exception applies" are three different
   * things to tell a student, and collapsing them loses the one that matters
   * most -- see types/conformance.ts.
   */
  readonly exception?: {
    readonly exceptionId: string;
    readonly state: string;
    readonly description: string;
    readonly detail: string;
    readonly quotedText: string;
  };
  readonly warrant: { readonly sourceId: string; readonly quotedText: string; readonly contentHash: string };
}

export type UncertaintyKind =
  | "UNRESOLVED_AUTHORITY"
  | "MISSING_EVENT_OR_FACT"
  | "INFERRED_CLAIM_HELD_FOR_REVIEW"
  | "REJECTED_CLAIM"
  | "SOURCE_CONFLICT"
  | "SOURCE_UNAVAILABLE"
  /**
   * The requirement was not met as written, the governing source attaches an
   * exception to it, and the case record establishes neither that the
   * exception applies nor that it does not. Kept distinct from
   * MISSING_EVENT_OR_FACT because the missing fact here is specific,
   * nameable, and actionable: the record needs one of two stated events
   * before this can resolve either way.
   */
  | "UNRESOLVED_EXCEPTION";

export interface TraceUncertainty {
  readonly kind: UncertaintyKind;
  readonly detail: string;
}

export interface RecourseTrace {
  readonly traceVersion: number;
  /** sha256 over the canonical serialization of every other field. Set last; see traceContentHash. */
  readonly traceHash: string;
  readonly case: {
    readonly caseId: string;
    readonly evaluationAt: string;
    readonly dataMarker?: string;
  };
  readonly authority: {
    readonly query: AnalyzeCaseResult["authorityQuery"];
    readonly status: string;
    readonly reason: string;
    readonly governingSourceId?: string;
    readonly supportingSourceIds: ReadonlyArray<string>;
    readonly candidateSourceIds: ReadonlyArray<string>;
    readonly declaredSources: AnalyzeCaseResult["policySources"];
    readonly validatedLineage: AnalyzeCaseResult["relationships"]["validated"];
  };
  readonly sources: ReadonlyArray<SourceProvenance>;
  readonly validation: {
    readonly validatedClaims: ReadonlyArray<TraceValidatedClaim>;
    readonly rejectedClaims: ReadonlyArray<TraceRejectedClaim>;
    readonly needsReviewClaims: ReadonlyArray<TraceReviewClaim>;
  };
  readonly procedure: {
    readonly actors: ReadonlyArray<string>;
    readonly obligations: ReadonlyArray<TraceObligation>;
    readonly advisoryRules: ReadonlyArray<{ readonly id: string; readonly actor: string; readonly action: string; readonly deonticForce: string }>;
    readonly eligibilityGrounds: ReadonlyArray<{ readonly id: string; readonly closure: string; readonly polarity?: string; readonly ids: ReadonlyArray<string> }>;
    readonly eligibility: AnalyzeCaseResult["caseState"]["eligibility"];
    readonly conflicts: AnalyzeCaseResult["conflicts"];
  };
  readonly observedCase: {
    readonly appendOnly: true;
    readonly events: ReadonlyArray<CaseEvent>;
  };
  readonly conformance: ReadonlyArray<TraceFinding>;
  readonly forecast: ReadonlyArray<ForecastPoint>;
  readonly uncertainty: ReadonlyArray<TraceUncertainty>;
  readonly boundary: string;
}

function describeConstraint(c: ConformanceConstraint): string {
  if (c.kind === "required_event") {
    return c.closesUponEventType
      ? `"${c.eventType}" must be recorded, at the latest before "${c.closesUponEventType}" occurs`
      : `"${c.eventType}" must be recorded`;
  }
  if (c.kind === "required_before") {
    return `"${c.eventType}" must occur strictly before "${c.beforeEventType}"`;
  }
  return `at least ${c.minimum.amount} ${c.minimum.unit}(s) must elapse between "${c.anchorEventType}" and "${c.targetEventType}"`;
}

function constraintEventTypes(c: ConformanceConstraint): string[] {
  if (c.kind === "required_event") return c.closesUponEventType ? [c.eventType, c.closesUponEventType] : [c.eventType];
  if (c.kind === "required_before") return [c.eventType, c.beforeEventType];
  return [c.anchorEventType, c.targetEventType];
}

/**
 * Canonical JSON: object keys sorted at every level, so the same trace
 * content always serializes to the same bytes regardless of the order the
 * engine happened to build its objects in. Array order is meaningful and is
 * preserved.
 */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return Object.fromEntries(entries.map(([k, v]) => [k, canonicalize(v)]));
  }
  return value;
}

/** sha256 over the canonical serialization of the trace with `traceHash` itself excluded. */
export function traceContentHash(trace: Omit<RecourseTrace, "traceHash">): string {
  const json = JSON.stringify(canonicalize(trace));
  return `sha256:${createHash("sha256").update(json, "utf8").digest("hex")}`;
}

function collectUncertainty(analysis: AnalyzeCaseResult): TraceUncertainty[] {
  const out: TraceUncertainty[] = [];

  if (analysis.authority.status === "BLOCKED_SOURCE_UNAVAILABLE") {
    out.push({ kind: "SOURCE_UNAVAILABLE", detail: analysis.authority.reason });
  } else if (analysis.authority.status === "BLOCKED_SOURCE_CONFLICT") {
    out.push({ kind: "UNRESOLVED_AUTHORITY", detail: analysis.authority.reason });
  }

  for (const conflict of analysis.conflicts) {
    out.push({ kind: "SOURCE_CONFLICT", detail: `${conflict.ruleIdA} vs ${conflict.ruleIdB}: ${conflict.reason}` });
  }

  for (const review of [
    ...analysis.relationships.needsReview,
    ...analysis.rules.needsReview,
    ...analysis.conformanceRules.needsReview,
  ] as ReadonlyArray<{ candidate?: { id?: string }; reason?: string }>) {
    out.push({
      kind: "INFERRED_CLAIM_HELD_FOR_REVIEW",
      detail: `${review.candidate?.id ?? "(unidentified claim)"}: ${review.reason ?? "held for review"}`,
    });
  }

  for (const rejected of [
    ...analysis.relationships.rejected,
    ...analysis.rules.rejected,
    ...analysis.conformanceRules.rejected,
  ] as ReadonlyArray<{ ruleId?: string; relationshipId?: string; field?: string; message?: string }>) {
    out.push({
      kind: "REJECTED_CLAIM",
      detail: `${rejected.ruleId ?? rejected.relationshipId ?? "(unidentified claim)"} [${rejected.field ?? "?"}]: ${rejected.message ?? ""}`,
    });
  }

  for (const obligation of analysis.caseState.obligations) {
    if (obligation.status === "unknown") {
      out.push({ kind: "MISSING_EVENT_OR_FACT", detail: `obligation ${obligation.obligationId}: ${obligation.reason}` });
    }
  }

  for (const finding of analysis.conformance) {
    if (finding.exception?.state === "UNRESOLVED") {
      out.push({
        kind: "UNRESOLVED_EXCEPTION",
        detail: `conformance rule ${finding.ruleId}: ${finding.reason}`,
      });
    } else if (finding.status === "UNDETERMINED") {
      out.push({ kind: "MISSING_EVENT_OR_FACT", detail: `conformance rule ${finding.ruleId}: ${finding.reason}` });
    }
  }

  for (const deviation of analysis.deviations) {
    if (deviation.type === "POLICY_SOURCE_AMBIGUITY") {
      out.push({ kind: "SOURCE_CONFLICT", detail: deviation.detail });
    }
  }

  return out;
}

/**
 * Builds the Recourse Trace for one completed analysis. Pure: same
 * AnalyzeCaseResult in, byte-identical trace out, including the hash.
 */
export function buildRecourseTrace(analysis: AnalyzeCaseResult): RecourseTrace {
  const events = analysis.observedEvents;
  const eventsByType = new Map<string, CaseEvent[]>();
  for (const e of events) {
    const list = eventsByType.get(e.type) ?? [];
    list.push(e);
    eventsByType.set(e.type, list);
  }

  const warrantByRuleId = new Map(analysis.ruleWarrants.map((w) => [w.ruleId, w.warrant]));
  const ruleById = new Map(analysis.rules.validated.map((r) => [r.id, r]));

  const validatedClaims: TraceValidatedClaim[] = [
    ...analysis.relationships.validated.map((r) => ({
      claimId: r.id,
      kind: "source_relationship" as const,
      sourceId: r.fromSourceId,
      claimType: "directly_stated" as const,
      quotedText: r.quotedText,
      span: r.span,
      contentHash: r.contentHash,
    })),
    ...analysis.ruleWarrants.map((w) => ({
      claimId: w.ruleId,
      kind: "policy_rule" as const,
      sourceId: w.warrant.sourceId,
      claimType: w.warrant.claimType,
      quotedText: w.warrant.quotedText,
      span: w.warrant.span,
      contentHash: w.warrant.contentHash,
    })),
    ...analysis.conformanceRules.validated.map((r) => ({
      claimId: r.id,
      kind: "conformance_rule" as const,
      sourceId: r.sourceId,
      claimType: r.warrant.claimType,
      quotedText: r.warrant.quotedText,
      span: r.warrant.span,
      contentHash: r.warrant.contentHash,
    })),
  ];

  const rejectedClaims: TraceRejectedClaim[] = [
    ...(analysis.relationships.rejected as ReadonlyArray<{ relationshipId?: string; field?: string; message?: string }>).map((e) => ({
      claimId: e.relationshipId ?? "(unidentified)",
      kind: "source_relationship" as const,
      field: e.field ?? "?",
      reason: e.message ?? "",
    })),
    ...(analysis.rules.rejected as ReadonlyArray<{ ruleId?: string; field?: string; message?: string }>).map((e) => ({
      claimId: e.ruleId ?? "(unidentified)",
      kind: "policy_rule" as const,
      field: e.field ?? "?",
      reason: e.message ?? "",
    })),
    ...(analysis.conformanceRules.rejected as ReadonlyArray<{ ruleId?: string; field?: string; message?: string }>).map((e) => ({
      claimId: e.ruleId ?? "(unidentified)",
      kind: "conformance_rule" as const,
      field: e.field ?? "?",
      reason: e.message ?? "",
    })),
  ];

  const needsReviewClaims: TraceReviewClaim[] = [
    ...(analysis.relationships.needsReview as ReadonlyArray<{ candidate?: { id?: string }; reason?: string }>).map((r) => ({
      claimId: r.candidate?.id ?? "(unidentified)",
      kind: "source_relationship" as const,
      reason: r.reason ?? "",
    })),
    ...(analysis.rules.needsReview as ReadonlyArray<{ candidate?: { id?: string }; reason?: string }>).map((r) => ({
      claimId: r.candidate?.id ?? "(unidentified)",
      kind: "policy_rule" as const,
      reason: r.reason ?? "",
    })),
    ...(analysis.conformanceRules.needsReview as ReadonlyArray<{ candidate?: { id?: string }; reason?: string }>).map((r) => ({
      claimId: r.candidate?.id ?? "(unidentified)",
      kind: "conformance_rule" as const,
      reason: r.reason ?? "",
    })),
  ];

  const obligations: TraceObligation[] = analysis.caseState.obligations.map((o) => {
    const rule = ruleById.get(o.obligationId);
    return {
      obligationId: o.obligationId,
      party: o.party,
      actor: rule?.actor ?? o.party,
      action: rule?.action ?? "(unknown)",
      deonticForce: rule?.deonticForce ?? "(unknown)",
      trigger: rule?.trigger?.eventType ?? null,
      deadline: rule?.deadline,
      dueAt: o.dueAt,
      status: o.status,
      reason: o.reason,
      sourceUrl: rule?.provenance.sourceUrl ?? "(unknown)",
      sourceSpan: warrantByRuleId.get(o.obligationId)?.quotedText ?? rule?.provenance.sourceSpan ?? "(unknown)",
    };
  });

  const conformanceRuleById = new Map(analysis.conformanceRules.validated.map((r) => [r.id, r]));
  const findings: TraceFinding[] = analysis.conformance.map((result) => {
    const rule = conformanceRuleById.get(result.ruleId)!;
    const relevantTypes = constraintEventTypes(rule.constraint);
    const observed = relevantTypes
      .flatMap((t) => eventsByType.get(t) ?? [])
      .map((e) => ({ eventId: e.eventId, type: e.type, occurredAt: e.occurredAt }));

    return {
      ruleId: result.ruleId,
      actor: rule.actor,
      expected: describeConstraint(rule.constraint),
      observedEvents: observed,
      status: result.status,
      calculation: result.reason,
      ...(result.exception && rule.exception
        ? {
            exception: {
              exceptionId: result.exception.exceptionId,
              state: result.exception.state,
              description: result.exception.description,
              detail: result.exception.detail,
              quotedText: rule.exception.warrant.quotedText,
            },
          }
        : {}),
      warrant: {
        sourceId: rule.warrant.sourceId,
        quotedText: rule.warrant.quotedText,
        contentHash: rule.warrant.contentHash,
      },
    };
  });

  const actors = [
    ...new Set([
      ...analysis.rules.validated.map((r) => r.actor),
      ...analysis.conformanceRules.validated.map((r) => r.actor),
    ]),
  ].sort();

  const withoutHash: Omit<RecourseTrace, "traceHash"> = {
    traceVersion: TRACE_VERSION,
    case: {
      caseId: analysis.caseId,
      evaluationAt: analysis.evaluationAt,
      ...(analysis.dataMarker === undefined ? {} : { dataMarker: analysis.dataMarker }),
    },
    authority: {
      query: analysis.authorityQuery,
      status: analysis.authority.status,
      reason: analysis.authority.reason,
      ...(analysis.authority.status === "APPLICABLE"
        ? { governingSourceId: analysis.authority.governingSourceId }
        : {}),
      supportingSourceIds:
        analysis.authority.status === "APPLICABLE" ? [...analysis.authority.supportingSourceIds] : [],
      candidateSourceIds:
        analysis.authority.status === "BLOCKED_SOURCE_CONFLICT" ? [...analysis.authority.candidateSourceIds] : [],
      declaredSources: analysis.policySources,
      validatedLineage: analysis.relationships.validated,
    },
    sources: analysis.sources,
    validation: { validatedClaims, rejectedClaims, needsReviewClaims },
    procedure: {
      actors,
      obligations,
      advisoryRules: analysis.advisoryRules.map((r) => ({
        id: r.id,
        actor: r.actor,
        action: r.action,
        deonticForce: r.deonticForce,
      })),
      eligibilityGrounds: analysis.eligibilityGrounds.map((r) => ({
        id: r.id,
        closure: r.groundsList?.closure ?? "UNKNOWN",
        ...(r.groundsPolarity === undefined ? {} : { polarity: r.groundsPolarity }),
        ids: r.groundsList?.ids ?? [],
      })),
      eligibility: analysis.caseState.eligibility,
      conflicts: analysis.conflicts,
    },
    observedCase: { appendOnly: true, events },
    conformance: findings,
    forecast: analysis.forecast,
    uncertainty: collectUncertainty(analysis),
    boundary: TRACE_BOUNDARY_STATEMENT,
  };

  return { ...withoutHash, traceHash: traceContentHash(withoutHash) };
}

function bullet(lines: ReadonlyArray<string>): string {
  return lines.length === 0 ? "_None._\n" : lines.map((l) => `- ${l}`).join("\n") + "\n";
}

function quote(text: string, max = 300): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  const clipped = collapsed.length > max ? `${collapsed.slice(0, max)}…` : collapsed;
  return `> ${clipped}`;
}

/**
 * Explicit, on the face of every trace, because it is the single most likely
 * thing for a reader to over-read. A finding that a step did not conform says
 * what the record shows against what the document requires. It does not say
 * the student wins, that anything is owed, or what the institution will now
 * do.
 */
const NOT_INFERRED_STATEMENT =
  "**No remedy or outcome is inferred here.** A finding in this record says only whether the recorded process matches the " +
  "published procedure. It does not establish that a decision was wrong, that any remedy is owed, what an institution " +
  "will decide, or any legal entitlement. Recourse does not write appeals, does not file anything, and is not legal advice.";

/** Plain-language gloss of each finding status, so the word is never the only explanation. */
function plainStatus(status: string): string {
  switch (status) {
    case "CONFORMANT":
      return "the requirement was met";
    case "NONCONFORMANT":
      return "the requirement was not met";
    case "EXCEPTION_APPLIES":
      return "the requirement was not met as written, but an exception the procedure itself states applies";
    case "UNDETERMINED":
      return "the record does not contain what is needed to decide";
    default:
      return status;
  }
}

function plainExceptionState(state: string): string {
  switch (state) {
    case "APPLIES":
      return "applies";
    case "EXCLUDED":
      return "ruled out by the record";
    case "UNRESOLVED":
      return "unresolved — the record settles it neither way";
    case "NOT_APPLICABLE":
      return "not reached";
    default:
      return state;
  }
}

function plainObligationStatus(status: string): string {
  switch (status) {
    case "pending":
      return "still running";
    case "met":
      return "done";
    case "missed":
      return "passed without the step being recorded";
    case "unknown":
      return "no date yet — the step that starts this clock has not happened";
    default:
      return status;
  }
}

/** The document a claim came from, by source id, for the human-facing sections. */
function sourceUrlOf(trace: RecourseTrace, sourceId: string): string {
  return trace.sources.find((s) => s.sourceId === sourceId)?.finalUrl ?? "(source not captured in this trace)";
}

/**
 * Human-readable rendering of the same trace.
 *
 * Written for the two people who actually read one: a student who has to
 * decide what to do next, and whoever they hand it to -- an adviser, an
 * ombuds office, a hearing panel. Neither of them knows or should need to
 * know anything about this codebase.
 *
 * The ordering is the whole design. The finding, the two clocks, and what
 * could not be determined come FIRST, in plain language, because a record
 * that opens with content hashes and extractor versions is a record whose
 * conclusion nobody reaches. Everything technical -- hashes, spans, warrants,
 * refused claims, the full computation -- is kept, unabridged, below a clear
 * divider. Nothing is dropped to make the top read better; it is moved.
 *
 * It remains a record and not an argument: there is no advocacy language,
 * UNDETERMINED findings are given the same prominence as violations, and the
 * limits of the record are stated in the summary rather than in a footnote.
 */
export function renderRecourseTraceMarkdown(trace: RecourseTrace): string {
  const out: string[] = [];

  // -------------------------------------------------------------------
  // 1. What this is, and what governs.
  // -------------------------------------------------------------------
  out.push(`# Recourse Trace — ${trace.case.caseId}`);
  out.push("");
  out.push(
    "_A procedural record: what the institution's published procedure requires, what this case's record shows happened, and whether the two match._"
  );
  out.push("");

  out.push("## Governing procedure");
  out.push("");
  out.push(`- **Decision type:** ${trace.authority.query.decisionType} at ${trace.authority.query.institution}`);
  if (trace.authority.governingSourceId) {
    const src = trace.sources.find((s) => s.sourceId === trace.authority.governingSourceId);
    out.push(`- **Governing document:** ${src ? src.finalUrl : trace.authority.governingSourceId}`);
    if (src) out.push(`- **Retrieved:** ${src.retrievedAt}`);
  }
  out.push(`- **Applicability:** ${trace.authority.status} — ${trace.authority.reason}`);
  out.push(`- **Case evaluated as of:** ${trace.case.evaluationAt}`);
  if (trace.case.dataMarker) out.push(`- **Case data:** ${trace.case.dataMarker}`);
  out.push("");

  if (trace.authority.status !== "APPLICABLE") {
    out.push(
      "> **No governing document was established for this decision, so no rule was compiled and no finding was made.** " +
        "That is the result, not a failure to produce one: acting on a procedure that may not govern this decision is how " +
        "a student is given a confidently wrong deadline."
    );
    out.push("");
  }

  // -------------------------------------------------------------------
  // 2. The findings, in plain language, with their evidence.
  // -------------------------------------------------------------------
  out.push("## Findings");
  out.push("");
  if (trace.conformance.length === 0) {
    out.push(
      trace.procedure.obligations.length > 0
        ? "_No step-by-step procedural requirement (notice periods, ordering, required steps) was compiled for this case, so there is nothing to report as conforming or not. The deadlines below are what this analysis produced._"
        : "_No procedural requirement was compiled for this case, so there is nothing to report as conforming or not._"
    );
    out.push("");
  } else {
    const tally = new Map<string, number>();
    for (const f of trace.conformance) tally.set(f.status, (tally.get(f.status) ?? 0) + 1);
    out.push(
      [...tally.entries()].map(([status, n]) => `**${n} ${status}**`).join(" · ") +
        " — each one below, with the source text it rests on."
    );
    out.push("");

    for (const f of trace.conformance) {
      out.push(`### ${f.status} — ${f.expected}`);
      out.push("");
      out.push(`- **Finding:** **${f.status}** (${plainStatus(f.status)})`);
      out.push(`- **Responsible party:** ${f.actor}`);
      out.push(`- **What the procedure required:** ${f.expected}`);
      out.push(
        `- **What actually happened:** ${
          f.observedEvents.length > 0
            ? f.observedEvents.map((e) => `${e.type} at ${e.occurredAt}`).join("; ")
            : "nothing relevant to this requirement is recorded"
        }`
      );
      if (f.exception) {
        out.push(
          `- **Exception stated by the procedure:** ${f.exception.description} — **${f.exception.state}** ` +
            `(${plainExceptionState(f.exception.state)}); ${f.exception.detail}`
        );
      }
      out.push(`- **How that was determined:** ${f.calculation}`);
      out.push(`- **The procedure's own words** (${sourceUrlOf(trace, f.warrant.sourceId)}):`);
      out.push(`  ${quote(f.warrant.quotedText)}`);
      if (f.exception) {
        out.push(`- **The exception's own words:**`);
        out.push(`  ${quote(f.exception.quotedText)}`);
      }
      out.push("");
    }
  }

  // -------------------------------------------------------------------
  // 3. Both clocks. The half students are normally shown is only one of them.
  // -------------------------------------------------------------------
  out.push("## Deadlines, on both sides");
  out.push("");
  if (trace.procedure.obligations.length === 0) {
    out.push("_No binding deadline was compiled for this case._");
    out.push("");
  } else {
    out.push("| Who | What the procedure requires of them | Due | Where that stands |");
    out.push("| --- | --- | --- | --- |");
    for (const o of trace.procedure.obligations) {
      const who = o.actor.trim().toLowerCase() === o.party ? o.party : `${o.party} (${o.actor})`;
      out.push(
        `| ${who} | ${o.deonticForce} ${o.action} | ${o.dueAt ?? "not yet determined"} | **${o.status}** — ${plainObligationStatus(o.status)} |`
      );
    }
    out.push("");
    for (const o of trace.procedure.obligations) {
      out.push(`- **${o.obligationId}** — ${o.reason}`);
      out.push(`  ${quote(o.sourceSpan, 200)}`);
    }
    out.push("");
  }

  const evaluatedForecast = trace.forecast.filter((p) => p.status === "evaluated");
  if (evaluatedForecast.length > 0) {
    out.push("**If nothing else is recorded, the same procedure implies:**");
    out.push("");
    out.push(
      bullet(
        evaluatedForecast.map(
          (p) =>
            `by **${p.evaluationAt}** — ${p.outcome}${
              p.changes.length > 0
                ? `: ${p.changes
                    .map((c) =>
                      c.kind === "obligation_status"
                        ? `${c.obligationId} ${c.from} → ${c.to}`
                        : c.kind === "conformance_status"
                          ? `${c.ruleId} ${c.from} → ${c.to}`
                          : c.kind === "obligation_due"
                            ? `${c.obligationId} due ${c.from ?? "unknown"} → ${c.to ?? "unknown"}`
                            : `eligibility ${c.from} → ${c.to}`
                    )
                    .join("; ")}`
                : ""
            }`
        )
      )
    );
    out.push(
      "_This states what the published procedure implies at a stated instant under the requester's assumptions. It is not a prediction of what the institution will do. Full scenarios and assumptions are below._"
    );
    out.push("");
  }

  if (trace.procedure.eligibilityGrounds.length > 0) {
    out.push(
      `**Eligibility:** ${trace.procedure.eligibility.result} — ${trace.procedure.eligibility.reason}`
    );
    out.push("");
  }

  // -------------------------------------------------------------------
  // 4. The limits of the record, stated up front rather than buried.
  // -------------------------------------------------------------------
  out.push("## What Recourse could not determine");
  out.push("");
  if (trace.uncertainty.length === 0) {
    out.push("_Nothing was left undetermined in this analysis._");
    out.push("");
  } else {
    out.push(bullet(trace.uncertainty.map((u) => `**${u.kind}** — ${u.detail}`)));
  }

  out.push("## What this record does not claim");
  out.push("");
  out.push(NOT_INFERRED_STATEMENT);
  out.push("");
  out.push(trace.boundary);
  out.push("");

  // -------------------------------------------------------------------
  // 5. Everything above, with its evidence. Nothing is summarised away here.
  // -------------------------------------------------------------------
  out.push("---");
  out.push("");
  out.push("# Evidence and working");
  out.push("");
  out.push(
    "_Everything the summary above rests on: which documents were fetched and what they hashed to, which claims were " +
      "accepted, which were refused and why, and the case's full event record. A reader who wants to check the finding " +
      "rather than read it starts here._"
  );
  out.push("");

  out.push("## Governing authority, in full");
  out.push("");
  out.push(`**Resolution:** ${trace.authority.status}`);
  out.push(`**Why:** ${trace.authority.reason}`);
  out.push("");
  if (trace.authority.governingSourceId) {
    out.push(`**Governing source:** \`${trace.authority.governingSourceId}\``);
    out.push(
      `**Supporting sources:** ${
        trace.authority.supportingSourceIds.length > 0
          ? trace.authority.supportingSourceIds.map((s) => `\`${s}\``).join(", ")
          : "none"
      }`
    );
    out.push("");
  }
  if (trace.authority.candidateSourceIds.length > 0) {
    out.push(
      `**Competing candidates with no validated relationship between them:** ${trace.authority.candidateSourceIds
        .map((s) => `\`${s}\``)
        .join(", ")}`
    );
    out.push("");
  }
  if (trace.authority.validatedLineage.length > 0) {
    out.push("**Validated lineage (each established by quoted source text, never inferred from a URL or title):**");
    out.push("");
    for (const rel of trace.authority.validatedLineage) {
      out.push(`- \`${rel.fromSourceId}\` **${rel.type}** \`${rel.toSourceId}\``);
      out.push(`  ${quote(rel.quotedText, 200)}`);
    }
    out.push("");
  }

  out.push("## Sources as captured");
  out.push("");
  for (const s of trace.sources) {
    out.push(`### \`${s.sourceId}\``);
    out.push(`- Final URL: ${s.finalUrl}`);
    out.push(`- Retrieved: ${s.retrievedAt}`);
    out.push(`- Content type: ${s.contentType}`);
    out.push(`- Raw document hash: \`${s.rawBytesHash}\``);
    out.push(`- Canonical text hash: \`${s.contentHash}\``);
    out.push(`- Extractor: ${s.extractor.name} v${s.extractor.version}`);
    out.push("");
  }

  out.push("## What was validated, and what was refused");
  out.push("");
  out.push(
    `Validated claims: **${trace.validation.validatedClaims.length}** · ` +
      `Refused: **${trace.validation.rejectedClaims.length}** · ` +
      `Held for human review: **${trace.validation.needsReviewClaims.length}**`
  );
  out.push("");
  out.push("### Validated");
  out.push("");
  if (trace.validation.validatedClaims.length === 0) {
    out.push("_None._");
    out.push("");
  } else {
    for (const claim of trace.validation.validatedClaims) {
      out.push(`**\`${claim.claimId}\`** (${claim.kind}, ${claim.claimType}) — source \`${claim.sourceId}\``);
      out.push(quote(claim.quotedText));
      out.push("");
    }
  }
  out.push("### Refused");
  out.push("");
  out.push(bullet(trace.validation.rejectedClaims.map((c) => `\`${c.claimId}\` (${c.kind}) — ${c.field}: ${c.reason}`)));
  out.push("### Held for human review");
  out.push("");
  out.push(bullet(trace.validation.needsReviewClaims.map((c) => `\`${c.claimId}\` (${c.kind}) — ${c.reason}`)));

  out.push("## The procedure as validated");
  out.push("");
  out.push(`**Parties:** ${trace.procedure.actors.length > 0 ? trace.procedure.actors.join(", ") : "none identified"}`);
  out.push("");
  if (trace.procedure.advisoryRules.length > 0) {
    out.push("**Advisory (non-binding) rules, kept separate and never used to gate state:**");
    out.push("");
    out.push(bullet(trace.procedure.advisoryRules.map((r) => `\`${r.id}\` — ${r.actor} ${r.deonticForce} ${r.action}`)));
  }
  if (trace.procedure.eligibilityGrounds.length > 0) {
    out.push("**Eligibility grounds:**");
    out.push("");
    out.push(
      bullet(
        trace.procedure.eligibilityGrounds.map(
          (g) => `\`${g.id}\` (${g.polarity ?? "unspecified"}, closure ${g.closure}): ${g.ids.join(", ")}`
        )
      )
    );
    out.push(`**Eligibility determination:** ${trace.procedure.eligibility.result} — ${trace.procedure.eligibility.reason}`);
    out.push("");
  }
  if (trace.procedure.conflicts.length > 0) {
    out.push("**Conflicting rules detected:**");
    out.push("");
    out.push(bullet(trace.procedure.conflicts.map((c) => `\`${c.ruleIdA}\` vs \`${c.ruleIdB}\` — ${c.reason}`)));
  }

  out.push("## The case record (append-only)");
  out.push("");
  if (trace.observedCase.events.length === 0) {
    out.push("_No events recorded._");
    out.push("");
  } else {
    out.push("| When | Event | Id |");
    out.push("| --- | --- | --- |");
    for (const e of trace.observedCase.events) {
      out.push(`| ${e.occurredAt} | ${e.type} | \`${e.eventId}\` |`);
    }
    out.push("");
  }

  out.push("## Findings — full computation and warrants");
  out.push("");
  if (trace.conformance.length === 0) {
    out.push("_No conformance rules were validated for this case._");
    out.push("");
  } else {
    for (const f of trace.conformance) {
      out.push(`### \`${f.ruleId}\` — **${f.status}**`);
      out.push("");
      out.push(`- **Responsible party:** ${f.actor}`);
      out.push(`- **Expected:** ${f.expected}`);
      out.push(
        `- **Observed:** ${
          f.observedEvents.length > 0
            ? f.observedEvents.map((e) => `${e.type} at ${e.occurredAt} (\`${e.eventId}\`)`).join("; ")
            : "no relevant event recorded"
        }`
      );
      out.push(`- **Determination:** ${f.calculation}`);
      if (f.exception) {
        out.push(
          `- **Exception \`${f.exception.exceptionId}\`:** ${f.exception.state} — ${f.exception.detail}`
        );
        out.push(`  ${quote(f.exception.quotedText)}`);
      }
      out.push(`- **Rule warrant** (source \`${f.warrant.sourceId}\`, content hash \`${f.warrant.contentHash}\`):`);
      out.push(`  ${quote(f.warrant.quotedText)}`);
      out.push("");
    }
  }

  out.push("## Obligations — full detail");
  out.push("");
  if (trace.procedure.obligations.length === 0) {
    out.push("_No binding obligations were validated._");
    out.push("");
  } else {
    out.push("| Obligation | Party | Force | Trigger | Due | Status |");
    out.push("| --- | --- | --- | --- | --- | --- |");
    for (const o of trace.procedure.obligations) {
      out.push(
        `| \`${o.obligationId}\` — ${o.action} | ${o.party} | ${o.deonticForce} | ${o.trigger ?? "—"} | ${o.dueAt ?? "—"} | **${o.status}** |`
      );
    }
    out.push("");
    for (const o of trace.procedure.obligations) {
      out.push(`- \`${o.obligationId}\` — ${o.reason}`);
      out.push(`  source: ${o.sourceUrl}`);
      out.push(`  ${quote(o.sourceSpan, 200)}`);
    }
    out.push("");
  }

  out.push("## Forecast");
  out.push("");
  if (trace.forecast.length === 0) {
    out.push("_No forecast scenarios were requested._");
    out.push("");
  } else {
    out.push(
      "_A forecast states what the validated procedure implies at a stated future instant, under assumptions the requester supplied. It is not a prediction of what the institution will do._"
    );
    out.push("");
    for (const point of trace.forecast) {
      if (point.status === "rejected") {
        out.push(`### \`${point.scenarioId}\` — scenario refused`);
        out.push("");
        out.push(bullet(point.errors.map((e) => `${e.field}: ${e.message}`)));
        continue;
      }
      out.push(`### \`${point.scenarioId}\` — ${point.kind} as of ${point.evaluationAt}`);
      out.push("");
      out.push(`**Result:** ${point.outcome}`);
      out.push("");
      out.push("**Stated assumptions:**");
      out.push("");
      out.push(bullet(point.assumptions.length > 0 ? point.assumptions : ["none stated"]));
      if (point.hypotheticalEventIds.length > 0) {
        out.push(
          `**Hypothetical events supplied by the requester** (not observed, not invented by Recourse): ${point.hypotheticalEventIds
            .map((id) => `\`${id}\``)
            .join(", ")}`
        );
        out.push("");
      }
      out.push("**What changes under this scenario:**");
      out.push("");
      out.push(
        bullet(
          point.changes.map((c) =>
            c.kind === "obligation_status"
              ? `obligation \`${c.obligationId}\`: ${c.from} → **${c.to}**`
              : c.kind === "obligation_due"
                ? `obligation \`${c.obligationId}\` due date: ${c.from ?? "unknown"} → **${c.to ?? "unknown"}**`
                : c.kind === "conformance_status"
                  ? `conformance \`${c.ruleId}\`: ${c.from} → **${c.to}**`
                  : `eligibility: ${c.from} → **${c.to}**`
          )
        )
      );
    }
  }

  out.push("## Trace integrity");
  out.push("");
  out.push(`- **Trace version:** ${trace.traceVersion}`);
  out.push(`- **Trace hash:** \`${trace.traceHash}\``);
  out.push("");
  out.push(
    "The trace hash is content-addressed over this captured analysis: the same captured sources, the same case record " +
      "and the same evaluation instant always produce this hash. It is not a fingerprint of the live web pages — a fresh " +
      "run that re-fetches those URLs records new retrieval metadata, so its hash will differ even where every finding is " +
      "identical. Use `recourse drift` to compare a pinned trace against the live sources."
  );
  out.push("");

  return out.join("\n");
}
