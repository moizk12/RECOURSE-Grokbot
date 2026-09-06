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
