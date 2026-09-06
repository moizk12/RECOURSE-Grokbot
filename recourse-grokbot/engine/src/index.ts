/**
 * Public library entrypoint. Anything that embeds this engine (a Grok Bot
 * skill/routine, a future API layer) should import from here rather than
 * reaching into individual src/ modules directly.
 */
export type {
  CandidatePolicyRule,
  ValidatedPolicyRule,
  DeonticForce,
  ListClosure,
  DeadlineSpec,
  Provenance,
} from "./types/policy.ts";
export type { CaseEvent, CaseEventType, CaseState, ObligationState, Deviation, DeviationType } from "./types/case.ts";
export type { SourceArtifact, ExtractorMetadata, EvidenceWarrant, ClaimType, WarrantError } from "./types/warrant.ts";
export type {
  SourceRelationType,
  AuthorityLevel,
  ApplicabilityScope,
  EffectiveWindow,
  PolicySource,
  CandidateSourceRelationship,
  ValidatedSourceRelationship,
  RelationshipWarrantError,
} from "./types/authority.ts";
export type {
  ConformanceConstraint,
  RequiredEventConstraint,
  RequiredBeforeConstraint,
  MinimumLeadTimeConstraint,
  CandidateConformanceRule,
  ValidatedConformanceRule,
  ConformanceRuleError,
  ConformanceStatus,
  ConformanceResult,
} from "./types/conformance.ts";

export { validateRule, validateRules } from "./validation/ruleValidator.ts";
export { validateProvenance } from "./validation/provenanceValidator.ts";
export { captureSource, hashContent, hashBytes, SourceStore } from "./warrant/sourceStore.ts";
export { acquireSource } from "./warrant/acquireSource.ts";
export type { AcquireSourceOptions } from "./warrant/acquireSource.ts";
export { checkWarrant } from "./warrant/warrantValidator.ts";
export type { WarrantOutcome } from "./warrant/warrantValidator.ts";
export { proposeAndValidate, proposeAndValidateAll } from "./warrant/pipeline.ts";
export type { PipelineOutcome, PipelineBatchResult } from "./warrant/pipeline.ts";
export { checkRelationshipWarrant } from "./authority/relationshipValidator.ts";
export type { RelationshipWarrantOutcome } from "./authority/relationshipValidator.ts";
export { resolveAuthority } from "./authority/authorityResolver.ts";
export type { AuthorityQuery, AuthorityResolution } from "./authority/authorityResolver.ts";
export { validateConformanceRule } from "./conformance/conformanceValidator.ts";
export type { ConformanceWarrantOutcome } from "./conformance/conformanceValidator.ts";
export { proposeConformanceRule, proposeConformanceRules } from "./conformance/conformancePipeline.ts";
export type { ConformancePipelineOutcome, ConformancePipelineBatchResult } from "./conformance/conformancePipeline.ts";
export { checkConformance, checkAllConformance } from "./conformance/conformanceChecker.ts";
export { resolveRawProposal, proposeRawAndValidate, proposeRawAndValidateAll } from "./warrant/rawProposal.ts";
export type { RawClaimProposal, RawProposalOutcome } from "./warrant/rawProposal.ts";
export { buildProcedureModel, detectConflicts } from "./procedure/procedureModel.ts";
export type { ProcedureModel, RuleConflict } from "./procedure/procedureModel.ts";
export { CaseEventLog } from "./case/eventLog.ts";
export { computeCaseState } from "./case/caseTwin.ts";
export { detectDeviations } from "./deviation/detector.ts";
export { addDays, isBusinessDay, FixedHolidayCalendar, NO_HOLIDAYS } from "./calendar/businessDayCalendar.ts";
export type { HolidayCalendar } from "./calendar/businessDayCalendar.ts";
export { FileCaseEventStore } from "./case/caseStore.ts";
export { evaluateFixture, evaluateFixtureFile } from "./cli/evaluate.ts";
export { resolveCase, resolveCaseFile } from "./cli/resolveCase.ts";
export type { ResolveCaseInput, ResolveCaseResult, SourceToAcquire, SourceProvenance } from "./cli/resolveCase.ts";
export { resolveQuote, findAllOccurrences } from "./warrant/resolveQuote.ts";
export type { QuoteResolution } from "./warrant/resolveQuote.ts";
export { allowedSourceIds, gateSourceId } from "./authority/authorityGate.ts";
export type { GateOutcome } from "./authority/authorityGate.ts";
export { proposeRawRelationship, proposeRawRelationships } from "./authority/rawRelationship.ts";
export type { RawRelationshipProposal, RawRelationshipOutcome, RawRelationshipBatchResult } from "./authority/rawRelationship.ts";
export { proposeRawConformanceRule, proposeRawConformanceRules } from "./conformance/rawConformance.ts";
export type { RawConformanceProposal, RawConformanceOutcome, RawConformanceBatchResult } from "./conformance/rawConformance.ts";
export { proposeGatedRawRule, proposeGatedRawRules } from "./warrant/gatedRawProposal.ts";
export { analyzeCase, analyzeCaseFile } from "./cli/analyzeCase.ts";
export type { AnalyzeCaseInput, AnalyzeCaseOptions, AnalyzeCaseResult } from "./cli/analyzeCase.ts";
export { forecastScenario, forecastScenarios } from "./forecast/forecast.ts";
export type {
  ForecastScenario,
  ForecastScenarioKind,
  ForecastInputs,
  ForecastPoint,
  ForecastOutcome,
  ForecastChange,
  ForecastError,
} from "./forecast/forecast.ts";
export { buildRecourseTrace, renderRecourseTraceMarkdown, traceContentHash, TRACE_VERSION, TRACE_BOUNDARY_STATEMENT } from "./trace/recourseTrace.ts";
export type {
  RecourseTrace,
  TraceValidatedClaim,
  TraceRejectedClaim,
  TraceReviewClaim,
  TraceObligation,
  TraceFinding,
  TraceUncertainty,
  UncertaintyKind,
  ClaimKind,
} from "./trace/recourseTrace.ts";
export type { GatedRuleBatchResult, GatedRuleOutcome, RuleWarrantRecord } from "./warrant/gatedRawProposal.ts";
export { checkSourceDrift, renderDriftMarkdown } from "./drift/sourceDrift.ts";
export type {
  SourceDriftStatus,
  SourceDriftFinding,
  SourceSnapshot,
  DependentClaim,
  CaseDriftReport,
  CheckDriftOptions,
} from "./drift/sourceDrift.ts";
export { driftCaseFile } from "./cli/driftCase.ts";
export type { DriftCaseOutput } from "./cli/driftCase.ts";
