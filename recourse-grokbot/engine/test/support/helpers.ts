import type { CandidatePolicyRule } from "../../src/types/policy.ts";

/** A minimally complete, otherwise-valid candidate rule, for tests to override fields on. */
export function baseCandidate(overrides: Partial<CandidatePolicyRule> = {}): CandidatePolicyRule {
  return {
    id: "r1",
    policyId: "policy-1",
    kind: "obligation",
    provenance: {
      sourceUrl: "https://example.edu/policy",
      retrievedAt: "2026-01-01T00:00:00Z",
      sourceSpan: "A student must file within 10 days.",
      actor: "student",
    },
    actor: "student",
    action: "file_appeal",
    trigger: { eventType: "decision_notice_received" },
    conditions: [],
    deonticForce: "MUST",
    deadline: { type: "relative", amount: 10, unit: "calendar_day", fromEvent: "decision_notice_received" },
    ...overrides,
  };
}
