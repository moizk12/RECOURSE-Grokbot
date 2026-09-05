import test from "node:test";
import assert from "node:assert/strict";
import { validateRules } from "../src/validation/ruleValidator.ts";
import { buildProcedureModel, detectConflicts } from "../src/procedure/procedureModel.ts";
import { computeCaseState } from "../src/case/caseTwin.ts";
import { detectDeviations } from "../src/deviation/detector.ts";
import { CaseEventLog } from "../src/case/eventLog.ts";
import { baseCandidate } from "./support/helpers.ts";

test("a normal, on-track pending obligation reports NORMAL_WAITING, not silence", () => {
  const { validated } = validateRules([baseCandidate()]);
  const procedure = buildProcedureModel(validated);
  const log = new CaseEventLog([
    { eventId: "e1", type: "decision_notice_received", occurredAt: "2026-01-01T00:00:00Z", detail: {} },
  ]);
  const state = computeCaseState(procedure, log, "2026-01-03T00:00:00Z");
  const deviations = detectDeviations({ procedure, caseState: state, log, conflicts: [], rejectedRuleErrors: [], sourceAmbiguities: [] });

  assert.ok(deviations.some((d) => d.type === "NORMAL_WAITING"));
});

test("STUDENT_REQUIREMENT_MISSING fires when required evidence has not been provided", () => {
  const evidenceRule = baseCandidate({
    id: "ev1",
    kind: "evidence_requirement",
    actor: "student",
    action: "medical_documentation",
    trigger: { eventType: "ground_asserted" },
    deadline: undefined,
    conditions: [{ id: "ground_id", description: "documented_extenuating_circumstances" }],
  });
  const { validated } = validateRules([evidenceRule]);
  const procedure = buildProcedureModel(validated);
  const log = new CaseEventLog();
  const state = computeCaseState(procedure, log, "2026-01-03T00:00:00Z");
  const deviations = detectDeviations({ procedure, caseState: state, log, conflicts: [], rejectedRuleErrors: [], sourceAmbiguities: [] });

  assert.ok(deviations.some((d) => d.type === "STUDENT_REQUIREMENT_MISSING"));
});

test("MISSING_SOURCE_EVIDENCE surfaces rejected candidate rules rather than dropping them silently", () => {
  const { validated, errors } = validateRules([baseCandidate({ provenance: undefined })]);
  const procedure = buildProcedureModel(validated);
  const log = new CaseEventLog();
  const state = computeCaseState(procedure, log, "2026-01-03T00:00:00Z");
  const deviations = detectDeviations({ procedure, caseState: state, log, conflicts: [], rejectedRuleErrors: errors, sourceAmbiguities: [] });

  assert.ok(deviations.some((d) => d.type === "MISSING_SOURCE_EVIDENCE"));
});

test("POLICY_SOURCE_AMBIGUITY surfaces explicit policy-level ambiguity notes", () => {
  const { validated } = validateRules([baseCandidate()]);
  const procedure = buildProcedureModel(validated);
  const log = new CaseEventLog();
  const state = computeCaseState(procedure, log, "2026-01-03T00:00:00Z");
  const deviations = detectDeviations({
    procedure,
    caseState: state,
    log,
    conflicts: [],
    rejectedRuleErrors: [],
    sourceAmbiguities: ["campus-wide and college-level pages describe different committee composition"],
  });

  assert.ok(deviations.some((d) => d.type === "POLICY_SOURCE_AMBIGUITY"));
});

test("CONFLICTING_RULES surfaces detected structural conflicts", () => {
  const a = baseCandidate({ id: "a", deonticForce: "MUST" });
  const b = baseCandidate({ id: "b", deonticForce: "MUST_NOT" });
  const { validated } = validateRules([a, b]);
  const conflicts = detectConflicts(validated);
  const procedure = buildProcedureModel(validated);
  const log = new CaseEventLog();
  const state = computeCaseState(procedure, log, "2026-01-03T00:00:00Z");
  const deviations = detectDeviations({ procedure, caseState: state, log, conflicts, rejectedRuleErrors: [], sourceAmbiguities: [] });

  assert.ok(deviations.some((d) => d.type === "CONFLICTING_RULES"));
});
