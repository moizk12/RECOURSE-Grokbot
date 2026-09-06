import { readFileSync } from "node:fs";
import type { CaseEvent } from "../types/case.ts";
import type { SourceArtifact } from "../types/warrant.ts";
import type { PolicySource } from "../types/authority.ts";
import type { ConformanceResult, ValidatedConformanceRule } from "../types/conformance.ts";
import type { ValidatedPolicyRule } from "../types/policy.ts";
import { acquireSource } from "../warrant/acquireSource.ts";
import { SourceStore } from "../warrant/sourceStore.ts";
import type { RawClaimProposal } from "../warrant/rawProposal.ts";
import { proposeGatedRawRules } from "../warrant/gatedRawProposal.ts";
import type { RawRelationshipProposal } from "../authority/rawRelationship.ts";
import { proposeRawRelationships } from "../authority/rawRelationship.ts";
import { resolveAuthority, type AuthorityQuery, type AuthorityResolution } from "../authority/authorityResolver.ts";
import type { RawConformanceProposal } from "../conformance/rawConformance.ts";
import { proposeRawConformanceRules } from "../conformance/rawConformance.ts";
import { checkAllConformance } from "../conformance/conformanceChecker.ts";
import { buildProcedureModel, detectConflicts, type RuleConflict } from "../procedure/procedureModel.ts";
import { CaseEventLog } from "../case/eventLog.ts";
import { computeCaseState } from "../case/caseTwin.ts";
import { detectDeviations } from "../deviation/detector.ts";
import { FixedHolidayCalendar } from "../calendar/businessDayCalendar.ts";
import type { SourceProvenance, SourceToAcquire } from "./resolveCase.ts";
import { toProvenance } from "./resolveCase.ts";

/**
 * `recourse analyze` -- the one production boundary that composes the FULL
 * current architecture:
 *
 *   source acquisition
 *     -> authority/lineage proposal        (untrusted, quote-only)
 *     -> lineage warrant validation
 *     -> authority resolution
 *     -> policy-rule proposal              (untrusted, quote-only)
 *     -> authority gate + rule warrant validation
 *     -> validated Procedure Model
 *     -> case event trace / Case Twin
 *     -> obligations + deterministic deadline computation
 *     -> conformance-rule proposal         (untrusted, quote-only)
 *     -> authority gate + conformance warrant validation
 *     -> authority-gated conformance checking
 *     -> deviations / uncertainty
 *
 * `recourse resolve` (cli/resolveCase.ts) remains exactly as it was: it is
 * the v0.1 contract, it has no authority layer, and nothing here changes it.
 * This is the superset entry point, and the only one an external agent
 * should target for new work.
 *
 * What the caller (a Grok Bot, a human) may supply is deliberately limited to
 * things a proposer can legitimately observe: which URLs to fetch, what each
 * source claims to be applicable to, which relationships/rules/constraints it
 * believes the text asserts, the quoted text supporting each, the case's
 * events, and the evaluation instant. Everything consequential -- capture,
 * hashing, span resolution, warrant verification, applicability, deadline
 * arithmetic, conformance status -- is computed here.
 */
export interface AnalyzeCaseInput {
  readonly caseId: string;
  /**
   * The instant this case is evaluated as of. Required and explicit; nothing
   * in this path ever reads wall-clock time to substitute one.
   */
  readonly evaluationAt: string;
  /** Free-text marker recorded verbatim in results/traces, e.g. "synthetic". Never inferred. */
  readonly dataMarker?: string;
  readonly holidays?: string[];
  readonly sourceAmbiguities?: string[];
  readonly sourcesToAcquire?: SourceToAcquire[];
  readonly sources?: SourceArtifact[];
  /** What each candidate source claims to be: institution, authority level, scope, effective window. */
  readonly policySources?: PolicySource[];
  /**
   * The decision this case needs a governing source for. `asOf` may be
   * omitted, in which case `evaluationAt` is used -- an explicit,
   * caller-supplied instant either way.
   */
  readonly authorityQuery: Omit<AuthorityQuery, "asOf"> & { readonly asOf?: string };
  readonly rawRelationships?: RawRelationshipProposal[];
  readonly rawProposals?: RawClaimProposal[];
  readonly rawConformanceRules?: RawConformanceProposal[];
  readonly events: CaseEvent[];
}

export interface AnalyzeCaseOptions {
  /** Injectable for tests only -- never used by the CLI, which always performs a real fetch. */
  readonly fetchImpl?: typeof fetch;
}

export interface AnalyzeCaseResult {
  readonly caseId: string;
  readonly evaluationAt: string;
  readonly dataMarker?: string;
  readonly sources: readonly SourceProvenance[];
  readonly authorityQuery: AuthorityQuery;
  readonly authority: AuthorityResolution;
  readonly relationships: {
    readonly validated: readonly { readonly id: string; readonly type: string; readonly fromSourceId: string; readonly toSourceId: string; readonly quotedText: string }[];
    readonly needsReview: readonly unknown[];
    readonly rejected: readonly unknown[];
  };
  readonly rules: {
    readonly validated: readonly ValidatedPolicyRule[];
    readonly needsReview: readonly unknown[];
    readonly rejected: readonly unknown[];
  };
  readonly conformanceRules: {
    readonly validated: readonly ValidatedConformanceRule[];
    readonly needsReview: readonly unknown[];
    readonly rejected: readonly unknown[];
  };
  readonly conflicts: readonly RuleConflict[];
  readonly caseState: ReturnType<typeof computeCaseState>;
  readonly conformance: readonly ConformanceResult[];
  readonly deviations: ReturnType<typeof detectDeviations>;
}

export async function analyzeCase(
  input: AnalyzeCaseInput,
  opts: AnalyzeCaseOptions = {}
): Promise<AnalyzeCaseResult> {
  // 1. Source acquisition. The only side effect in this function.
  const store = new SourceStore(input.sources ?? []);
  const usedSources = new Map<string, SourceArtifact>();
  for (const s of input.sources ?? []) usedSources.set(s.sourceId, s);

  for (const spec of input.sourcesToAcquire ?? []) {
    const artifact = await acquireSource({
      sourceId: spec.sourceId,
      requestedUrl: spec.requestedUrl,
      fetchImpl: opts.fetchImpl,
    });
    store.add(artifact);
    usedSources.set(artifact.sourceId, artifact);
  }

  // 2-3. Lineage proposals -> validated relationships.
  const relationships = proposeRawRelationships(input.rawRelationships ?? [], store);

  // 4. Authority resolution over declared sources + validated lineage only.
  const authorityQuery: AuthorityQuery = {
    ...input.authorityQuery,
    asOf: input.authorityQuery.asOf ?? input.evaluationAt,
  };
  const authority = resolveAuthority(input.policySources ?? [], relationships.validated, authorityQuery);

  // 5-6. Policy-rule proposals, gated on that resolution before any span work.
  const rules = proposeGatedRawRules(input.rawProposals ?? [], store, authority);

  // 7. Validated Procedure Model.
  const procedure = buildProcedureModel(rules.validated);
  const conflicts = detectConflicts(rules.validated);

  // 8-9. Case trace -> Case Twin -> obligations + deadlines.
  const calendar = new FixedHolidayCalendar(input.holidays ?? []);
  const log = new CaseEventLog(input.events);
  const caseState = computeCaseState(procedure, log, input.evaluationAt, calendar);

  // 10-12. Conformance proposals, gated identically, then checked against the trace.
  const conformanceRules = proposeRawConformanceRules(input.rawConformanceRules ?? [], store, authority);
  const conformance = checkAllConformance(conformanceRules.validated, log, calendar);

  // 13. Deviations / uncertainty.
  const deviations = detectDeviations({
    procedure,
    caseState,
    log,
    conflicts,
    rejectedRuleErrors: rules.errors,
    sourceAmbiguities: input.sourceAmbiguities ?? [],
  });

  return {
    caseId: input.caseId,
    evaluationAt: input.evaluationAt,
    dataMarker: input.dataMarker,
    sources: [...usedSources.values()].map(toProvenance),
    authorityQuery,
    authority,
    relationships: {
      validated: relationships.validated.map((r) => ({
        id: r.id,
        type: r.type,
        fromSourceId: r.fromSourceId,
        toSourceId: r.toSourceId,
        quotedText: r.warrant.quotedText,
      })),
      needsReview: relationships.needsReview,
      rejected: relationships.errors,
    },
    rules: { validated: rules.validated, needsReview: rules.needsReview, rejected: rules.errors },
    conformanceRules: {
      validated: conformanceRules.validated,
      needsReview: conformanceRules.needsReview,
      rejected: conformanceRules.errors,
    },
    conflicts,
    caseState,
    conformance,
    deviations,
  };
}

export async function analyzeCaseFile(path: string): Promise<AnalyzeCaseResult> {
  const raw = readFileSync(path, "utf-8");
  const input = JSON.parse(raw) as AnalyzeCaseInput;
  return analyzeCase(input);
}
