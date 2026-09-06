import { readFileSync } from "node:fs";
import type { CaseEvent } from "../types/case.ts";
import type { SourceArtifact } from "../types/warrant.ts";
import type { RawClaimProposal } from "../warrant/rawProposal.ts";
import { proposeRawAndValidateAll } from "../warrant/rawProposal.ts";
import { acquireSource } from "../warrant/acquireSource.ts";
import { SourceStore } from "../warrant/sourceStore.ts";
import { buildProcedureModel, detectConflicts } from "../procedure/procedureModel.ts";
import { CaseEventLog } from "../case/eventLog.ts";
import { computeCaseState } from "../case/caseTwin.ts";
import { detectDeviations } from "../deviation/detector.ts";
import { FixedHolidayCalendar } from "../calendar/businessDayCalendar.ts";

/** An authoritative source the CLI must fetch live before anything else runs. */
export interface SourceToAcquire {
  readonly sourceId: string;
  readonly requestedUrl: string;
}

/**
 * Input contract for `recourse resolve`, the one stable production entry
 * point exposing the full boundary: live source acquisition -> raw proposal
 * resolution -> warrant validation -> rule validation -> procedure model ->
 * Case Twin -> deviations. Every raw claim proposal must cite a source that
 * is either fetched live via `sourcesToAcquire` or supplied pre-captured via
 * `sources` (e.g. a previously acquired SourceArtifact) -- resolveRawProposal
 * (warrant/rawProposal.ts) then binds each proposal to that captured content
 * exactly as it already does for any other caller of this engine.
 */
export interface ResolveCaseInput {
  readonly evaluationAt: string;
  readonly holidays?: string[];
  readonly sourceAmbiguities?: string[];
  readonly sourcesToAcquire?: SourceToAcquire[];
  readonly sources?: SourceArtifact[];
  readonly rawProposals: RawClaimProposal[];
  readonly events: CaseEvent[];
}

/** Provenance metadata for one source actually used to resolve this case, live-acquired or pre-captured. */
export interface SourceProvenance {
  readonly sourceId: string;
  readonly requestedUrl: string;
  readonly finalUrl: string;
  readonly retrievedAt: string;
  readonly contentType: string;
  readonly rawBytesHash: string;
  readonly contentHash: string;
  readonly extractor: SourceArtifact["extractor"];
}

export interface ResolveCaseResult {
  readonly validatedRuleCount: number;
  readonly rejectedRuleCount: number;
  readonly rejectedRuleErrors: readonly unknown[];
  readonly needsReviewCount: number;
  readonly needsReview: readonly unknown[];
  readonly caseState: ReturnType<typeof computeCaseState>;
  readonly deviations: ReturnType<typeof detectDeviations>;
  readonly conflicts: ReturnType<typeof detectConflicts>;
  readonly sources: readonly SourceProvenance[];
}

export function toProvenance(source: SourceArtifact): SourceProvenance {
  return {
    sourceId: source.sourceId,
    requestedUrl: source.requestedUrl,
    finalUrl: source.finalUrl,
    retrievedAt: source.retrievedAt,
    contentType: source.contentType,
    rawBytesHash: source.rawBytesHash,
    contentHash: source.contentHash,
    extractor: source.extractor,
  };
}

/**
 * The full untrusted-input-to-case-state boundary, in one call: acquire every
 * live source first (network I/O, the only side effect in this function),
 * then hand the resulting SourceStore to the existing, unchanged
 * warrant-resolution -> rule-validation -> procedure -> Case Twin ->
 * deviation pipeline. No engine semantics change here -- this only composes
 * already-implemented stages (warrant/rawProposal.ts, procedure/procedureModel.ts,
 * case/caseTwin.ts, deviation/detector.ts) that a caller previously had to
 * wire together itself.
 */
export interface ResolveCaseOptions {
  /** Injectable for tests only -- never used by the CLI, which always performs a real fetch. */
  readonly fetchImpl?: typeof fetch;
}

export async function resolveCase(input: ResolveCaseInput, opts: ResolveCaseOptions = {}): Promise<ResolveCaseResult> {
  const store = new SourceStore(input.sources ?? []);
  const acquired: SourceArtifact[] = [];

  for (const spec of input.sourcesToAcquire ?? []) {
    const artifact = await acquireSource({
      sourceId: spec.sourceId,
      requestedUrl: spec.requestedUrl,
      fetchImpl: opts.fetchImpl,
    });
    store.add(artifact);
    acquired.push(artifact);
  }

  const { validated, needsReview, errors } = proposeRawAndValidateAll(input.rawProposals, store);
  const procedure = buildProcedureModel(validated);
  const conflicts = detectConflicts(validated);
  const calendar = new FixedHolidayCalendar(input.holidays ?? []);
  const log = new CaseEventLog(input.events);
  const caseState = computeCaseState(procedure, log, input.evaluationAt, calendar);
  const deviations = detectDeviations({
    procedure,
    caseState,
    log,
    conflicts,
    rejectedRuleErrors: errors,
    sourceAmbiguities: input.sourceAmbiguities ?? [],
  });

  const usedSources = new Map<string, SourceArtifact>();
  for (const s of input.sources ?? []) usedSources.set(s.sourceId, s);
  for (const s of acquired) usedSources.set(s.sourceId, s);

  return {
    validatedRuleCount: validated.length,
    rejectedRuleCount: errors.length,
    rejectedRuleErrors: errors,
    needsReviewCount: needsReview.length,
    needsReview,
    caseState,
    deviations,
    conflicts,
    sources: [...usedSources.values()].map(toProvenance),
  };
}

export async function resolveCaseFile(path: string): Promise<ResolveCaseResult> {
  const raw = readFileSync(path, "utf-8");
  const input = JSON.parse(raw) as ResolveCaseInput;
  return resolveCase(input);
}
