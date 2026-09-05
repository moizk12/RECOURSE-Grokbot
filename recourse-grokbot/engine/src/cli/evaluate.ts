import { readFileSync } from "node:fs";
import type { CandidatePolicyRule } from "../types/policy.ts";
import type { CaseEvent } from "../types/case.ts";
import type { SourceArtifact } from "../types/warrant.ts";
import { buildProcedureModel, detectConflicts } from "../procedure/procedureModel.ts";
import { CaseEventLog } from "../case/eventLog.ts";
import { computeCaseState } from "../case/caseTwin.ts";
import { detectDeviations } from "../deviation/detector.ts";
import { FixedHolidayCalendar } from "../calendar/businessDayCalendar.ts";
import { SourceStore } from "../warrant/sourceStore.ts";
import { proposeAndValidateAll } from "../warrant/pipeline.ts";

interface Fixture {
  /**
   * The point in time this fixture is evaluated as of. Required and
   * explicit — read verbatim from the fixture file, never defaulted to the
   * current wall-clock time. Renamed from the earlier "now" field name,
   * which invited confusion with ambient/system time; this value is a fixed
   * synthetic evaluation instant chosen by whoever authored the fixture.
   */
  evaluationAt: string;
  holidays?: string[];
  sourceAmbiguities?: string[];
  /** Captured source artifacts that candidateRules' warrants may cite. */
  sources?: SourceArtifact[];
  candidateRules: CandidatePolicyRule[];
  events: CaseEvent[];
}

export interface EvaluationResult {
  readonly rejectedRuleCount: number;
  readonly validatedRuleCount: number;
  readonly rejectedRuleErrors: readonly unknown[];
  readonly needsReviewCount: number;
  readonly needsReview: readonly unknown[];
  readonly caseState: ReturnType<typeof computeCaseState>;
  readonly deviations: ReturnType<typeof detectDeviations>;
  readonly conflicts: ReturnType<typeof detectConflicts>;
}

/**
 * Pure function over an already-loaded fixture — no LLM call and no network
 * fetch anywhere in this path. Every candidate rule passes through the
 * warrant layer (warrant/pipeline.ts) before the existing rule-validation
 * pipeline ever sees it; rules that are structurally valid but only
 * "inferred" from their cited evidence land in `needsReview`, not
 * `caseState`, and never reach the procedure model.
 */
export function evaluateFixture(fixture: Fixture): EvaluationResult {
  const store = new SourceStore(fixture.sources ?? []);
  const { validated, needsReview, errors } = proposeAndValidateAll(fixture.candidateRules, store);
  const procedure = buildProcedureModel(validated);
  const conflicts = detectConflicts(validated);
  const calendar = new FixedHolidayCalendar(fixture.holidays ?? []);
  const log = new CaseEventLog(fixture.events);
  const caseState = computeCaseState(procedure, log, fixture.evaluationAt, calendar);
  const deviations = detectDeviations({
    procedure,
    caseState,
    log,
    conflicts,
    rejectedRuleErrors: errors,
    sourceAmbiguities: fixture.sourceAmbiguities ?? [],
  });

  return {
    rejectedRuleCount: errors.length,
    validatedRuleCount: validated.length,
    rejectedRuleErrors: errors,
    needsReviewCount: needsReview.length,
    needsReview,
    caseState,
    deviations,
    conflicts,
  };
}

export function evaluateFixtureFile(path: string): EvaluationResult {
  const raw = readFileSync(path, "utf-8");
  const fixture = JSON.parse(raw) as Fixture;
  return evaluateFixture(fixture);
}
