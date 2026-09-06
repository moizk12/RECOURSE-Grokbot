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
export const TRACE_VERSION = 1;

/**
 * Stated on every trace, machine-readable and rendered into the Markdown, so
 * a reader who sees only one artifact still sees the limit of what it claims.
 */
export const TRACE_BOUNDARY_STATEMENT =
  "Recourse compares a published institutional procedure against the recorded events of one case. " +
  "It does not infer a remedy, a legal entitlement, guilt, innocence, or any guaranteed institutional outcome. " +
  "A finding below states only whether an observed process matches a procedural rule that was validated against " +
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
  readonly warrant: { readonly sourceId: string; readonly quotedText: string; readonly contentHash: string };
}

export type UncertaintyKind =
  | "UNRESOLVED_AUTHORITY"
  | "MISSING_EVENT_OR_FACT"
  | "INFERRED_CLAIM_HELD_FOR_REVIEW"
  | "REJECTED_CLAIM"
  | "SOURCE_CONFLICT"
  | "SOURCE_UNAVAILABLE";

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
    if (finding.status === "UNDETERMINED") {
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
 * Human-readable rendering of the same trace. Written for a student handing
 * this to an advisor or an ombuds office: it names the document, the rule,
 * the date, and the finding, without requiring any knowledge of this
 * codebase. It is a record, not an argument -- there is no advocacy language
 * here, and rejected/undetermined items are given the same prominence as
 * findings.
 */
export function renderRecourseTraceMarkdown(trace: RecourseTrace): string {
  const out: string[] = [];

  out.push(`# Recourse Trace — ${trace.case.caseId}`);
  out.push("");
  out.push(`**Evaluated as of:** ${trace.case.evaluationAt}`);
  if (trace.case.dataMarker) out.push(`**Case data:** ${trace.case.dataMarker}`);
  out.push(`**Trace hash:** \`${trace.traceHash}\``);
  out.push("");

  out.push("## Governing authority");
  out.push("");
  out.push(`**Decision type:** ${trace.authority.query.decisionType} at ${trace.authority.query.institution}`);
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
  if (trace.procedure.obligations.length === 0) {
    out.push("_No binding obligations were validated._");
    out.push("");
  } else {
    out.push("| Obligation | Party | Due | Status |");
    out.push("| --- | --- | --- | --- |");
    for (const o of trace.procedure.obligations) {
      out.push(`| \`${o.obligationId}\` — ${o.deonticForce} ${o.action} | ${o.party} | ${o.dueAt ?? "—"} | **${o.status}** |`);
    }
    out.push("");
    for (const o of trace.procedure.obligations) {
      out.push(`- \`${o.obligationId}\`: ${o.reason}`);
      out.push(`  ${quote(o.sourceSpan, 200)}`);
    }
    out.push("");
  }
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

  out.push("## What actually happened (append-only case record)");
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

  out.push("## Conformance findings");
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
            ? f.observedEvents.map((e) => `${e.type} at ${e.occurredAt}`).join("; ")
            : "no relevant event recorded"
        }`
      );
      out.push(`- **Determination:** ${f.calculation}`);
      out.push(`- **Rule warrant** (source \`${f.warrant.sourceId}\`):`);
      out.push(`  ${quote(f.warrant.quotedText)}`);
      out.push("");
    }
  }

  out.push("## Forecast");
  out.push("");
  if (trace.forecast.length === 0) {
    out.push("_No forecast scenarios were requested._");
    out.push("");
  } else {
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

  out.push("## What could not be determined");
  out.push("");
  out.push(bullet(trace.uncertainty.map((u) => `**${u.kind}** — ${u.detail}`)));

  out.push("## Scope of this record");
  out.push("");
  out.push(trace.boundary);
  out.push("");

  return out.join("\n");
}
