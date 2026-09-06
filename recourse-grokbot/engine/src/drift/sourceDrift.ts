import type { RecourseTrace } from "../trace/recourseTrace.ts";
import type { SourceArtifact } from "../types/warrant.ts";
import { acquireSource } from "../warrant/acquireSource.ts";

/**
 * Case-aware source drift.
 *
 * A case is validated against documents as they existed at one moment. Those
 * documents keep changing. This re-acquires the exact URLs a stored case was
 * validated against and compares them with the versions actually used, then
 * says which of that case's conclusions can no longer be presented as
 * current.
 *
 * The discipline that matters here is what it does NOT do:
 *
 * - It never promotes rules from the new version. A changed page is not a
 *   re-validated page; nothing here compiles anything.
 * - It never quietly keeps a consequential old conclusion as current. Every
 *   claim and finding that depended on a changed source is marked
 *   REVALIDATION_REQUIRED, and any prior conclusion is carried explicitly as
 *   stale.
 * - It never claims the RULE changed. A different hash proves the document
 *   is not the one that was read; whether the substantive requirement moved
 *   is a question for a human re-validation, and saying otherwise from a
 *   hash comparison would be exactly the kind of confident inference this
 *   system exists to refuse.
 */
export type SourceDriftStatus =
  /** Same bytes, same canonical text, same extractor. */
  | "UNCHANGED"
  /** The document served at this URL is not the document that was read. */
  | "SOURCE_CHANGED"
  /** Identical bytes, different canonical text -- the extraction changed, not the document. */
  | "EXTRACTOR_DRIFT"
  /** The URL could not be re-acquired at all. */
  | "SOURCE_UNAVAILABLE";

export interface SourceSnapshot {
  readonly finalUrl: string;
  readonly retrievedAt: string;
  readonly contentType: string;
  readonly rawBytesHash: string;
  readonly contentHash: string;
  readonly extractor: SourceArtifact["extractor"];
}

export interface DependentClaim {
  readonly claimId: string;
  readonly kind: string;
  readonly disposition: "REVALIDATION_REQUIRED";
  /** The conclusion this claim supported when the case was validated. Explicitly stale, never presented as current. */
  readonly staleConclusion?: string;
}

export interface SourceDriftFinding {
  readonly sourceId: string;
  readonly requestedUrl: string;
  readonly status: SourceDriftStatus;
  readonly detail: string;
  readonly pinned: SourceSnapshot;
  readonly current?: SourceSnapshot;
  readonly dependentClaims: ReadonlyArray<DependentClaim>;
}

export interface CaseDriftReport {
  readonly caseId: string;
  /** The trace this case was checked against, pinned by its own content hash. */
  readonly traceHash: string;
  /** Caller-supplied instant of the check. Explicit, like every other time in this engine. */
  readonly checkedAt: string;
  readonly sources: ReadonlyArray<SourceDriftFinding>;
  readonly overall: "UNCHANGED" | "REVALIDATION_REQUIRED";
  readonly summary: string;
}

export interface CheckDriftOptions {
  /** Explicit instant of this check. */
  readonly checkedAt: string;
  /** Injectable for tests only. */
  readonly fetchImpl?: typeof fetch;
}

function snapshotOf(source: {
  finalUrl: string;
  retrievedAt: string;
  contentType: string;
  rawBytesHash: string;
  contentHash: string;
  extractor: SourceArtifact["extractor"];
}): SourceSnapshot {
  return {
    finalUrl: source.finalUrl,
    retrievedAt: source.retrievedAt,
    contentType: source.contentType,
    rawBytesHash: source.rawBytesHash,
    contentHash: source.contentHash,
    extractor: source.extractor,
  };
}

/**
 * Maps every consequential conclusion in a trace back to the source it
 * depended on. This is what makes drift case-aware rather than a bare
 * "the page changed" notification: a changed source only matters here in
 * terms of the specific claims and findings it invalidates.
 */
function dependentsBySource(trace: RecourseTrace): Map<string, DependentClaim[]> {
  const bySource = new Map<string, DependentClaim[]>();
  const add = (sourceId: string, claim: DependentClaim) => {
    const list = bySource.get(sourceId) ?? [];
    list.push(claim);
    bySource.set(sourceId, list);
  };

  const obligationById = new Map(trace.procedure.obligations.map((o) => [o.obligationId, o]));
  const findingById = new Map(trace.conformance.map((f) => [f.ruleId, f]));

  for (const claim of trace.validation.validatedClaims) {
    const obligation = obligationById.get(claim.claimId);
    const finding = findingById.get(claim.claimId);

    const staleConclusion = obligation
      ? `obligation ${obligation.obligationId} was ${obligation.status}${obligation.dueAt ? ` (due ${obligation.dueAt})` : ""}`
      : finding
        ? `conformance finding ${finding.ruleId} was ${finding.status}`
        : claim.kind === "source_relationship"
          ? `lineage edge ${claim.claimId} established the governing source for this case`
          : undefined;

    add(claim.sourceId, {
      claimId: claim.claimId,
      kind: claim.kind,
      disposition: "REVALIDATION_REQUIRED",
      ...(staleConclusion === undefined ? {} : { staleConclusion }),
    });
  }

  return bySource;
}

function classify(pinned: SourceSnapshot, current: SourceSnapshot): { status: SourceDriftStatus; detail: string } {
  if (pinned.rawBytesHash !== current.rawBytesHash) {
    return {
      status: "SOURCE_CHANGED",
      detail:
        `the document served at this URL no longer hashes to the version this case was validated against ` +
        `(was ${pinned.rawBytesHash}, now ${current.rawBytesHash}). This proves the document changed; it does NOT ` +
        `establish that the substantive rule changed. Affected claims require human revalidation.`,
    };
  }

  if (pinned.contentHash !== current.contentHash) {
    const extractorMoved =
      pinned.extractor.name !== current.extractor.name || pinned.extractor.version !== current.extractor.version;
    return {
      status: "EXTRACTOR_DRIFT",
      detail:
        `the raw document is byte-identical, but its canonical text is not ` +
        `(was ${pinned.contentHash}, now ${current.contentHash})` +
        (extractorMoved
          ? `, and the extractor changed from ${pinned.extractor.name} v${pinned.extractor.version} to ${current.extractor.name} v${current.extractor.version}`
          : ", with no change of extractor recorded") +
        `. Warrant spans pinned to the old canonical text no longer resolve; affected claims require revalidation.`,
    };
  }

  return { status: "UNCHANGED", detail: "raw document, canonical text, and extractor all match the pinned version" };
}

/**
 * Re-acquires every source a stored trace depended on and reports what that
 * means for the case. Performs network I/O and nothing else -- no
 * validation, no compilation, no state change.
 */
export async function checkSourceDrift(trace: RecourseTrace, opts: CheckDriftOptions): Promise<CaseDriftReport> {
  const dependents = dependentsBySource(trace);
  const findings: SourceDriftFinding[] = [];

  for (const pinnedSource of trace.sources) {
    const pinned = snapshotOf(pinnedSource);
    const dependentClaims = dependents.get(pinnedSource.sourceId) ?? [];

    let current: SourceArtifact | undefined;
    let unavailableReason: string | undefined;

    try {
      current = await acquireSource({
        sourceId: pinnedSource.sourceId,
        // Re-fetch the URL originally requested, not the redirect target:
        // a changed redirect is itself a change worth seeing.
        requestedUrl: pinnedSource.requestedUrl,
        fetchImpl: opts.fetchImpl,
      });
    } catch (e) {
      unavailableReason = e instanceof Error ? e.message : String(e);
    }

    if (!current) {
      findings.push({
        sourceId: pinnedSource.sourceId,
        requestedUrl: pinnedSource.requestedUrl,
        status: "SOURCE_UNAVAILABLE",
        detail: `could not re-acquire this source: ${unavailableReason ?? "unknown error"}. Its conclusions cannot be confirmed as current.`,
        pinned,
        dependentClaims,
      });
      continue;
    }

    const currentSnapshot = snapshotOf(current);
    const { status, detail } = classify(pinned, currentSnapshot);

    findings.push({
      sourceId: pinnedSource.sourceId,
      requestedUrl: pinnedSource.requestedUrl,
      status,
      detail,
      pinned,
      current: currentSnapshot,
      // An unchanged source invalidates nothing, so it lists no dependents.
      dependentClaims: status === "UNCHANGED" ? [] : dependentClaims,
    });
  }

  const drifted = findings.filter((f) => f.status !== "UNCHANGED");
  const affectedCount = drifted.reduce((n, f) => n + f.dependentClaims.length, 0);

  return {
    caseId: trace.case.caseId,
    traceHash: trace.traceHash,
    checkedAt: opts.checkedAt,
    sources: findings,
    overall: drifted.length === 0 ? "UNCHANGED" : "REVALIDATION_REQUIRED",
    summary:
      drifted.length === 0
        ? `all ${findings.length} pinned source(s) are unchanged; every conclusion in this trace still rests on the document it was validated against`
        : `${drifted.length} of ${findings.length} pinned source(s) changed or became unavailable, affecting ${affectedCount} validated claim(s). ` +
          `Those conclusions are marked stale and require revalidation; none has been re-derived from the new version.`,
  };
}

/** Human-readable rendering, for the same audience as the Recourse Trace itself. */
export function renderDriftMarkdown(report: CaseDriftReport): string {
  const out: string[] = [];

  out.push(`# Source drift check — ${report.caseId}`);
  out.push("");
  out.push(`**Checked as of:** ${report.checkedAt}`);
  out.push(`**Trace:** \`${report.traceHash}\``);
  out.push(`**Result:** ${report.overall}`);
  out.push("");
  out.push(report.summary);
  out.push("");

  for (const finding of report.sources) {
    out.push(`## \`${finding.sourceId}\` — ${finding.status}`);
    out.push("");
    out.push(`- URL: ${finding.requestedUrl}`);
    out.push(`- Validated against: ${finding.pinned.contentHash} (retrieved ${finding.pinned.retrievedAt})`);
    if (finding.current) {
      out.push(`- Now serving: ${finding.current.contentHash} (retrieved ${finding.current.retrievedAt})`);
    }
    out.push("");
    out.push(finding.detail);
    out.push("");
    if (finding.dependentClaims.length > 0) {
      out.push("**Conclusions that rested on this source and must be revalidated:**");
      out.push("");
      for (const claim of finding.dependentClaims) {
        out.push(
          `- \`${claim.claimId}\` (${claim.kind}) — ${claim.disposition}` +
            (claim.staleConclusion ? `; previously: ${claim.staleConclusion} (now stale)` : "")
        );
      }
      out.push("");
    }
  }

  return out.join("\n");
}
