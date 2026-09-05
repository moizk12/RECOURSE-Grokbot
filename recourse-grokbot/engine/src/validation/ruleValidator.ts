import type { CandidatePolicyRule, ValidatedPolicyRule, DeonticForce } from "../types/policy.ts";
import type { ValidationError } from "./errors.ts";
import { err } from "./errors.ts";
import { type Result, ok, fail } from "../types/result.ts";
import { validateProvenance } from "./provenanceValidator.ts";

const VALID_FORCES: ReadonlySet<string> = new Set([
  "MUST",
  "MUST_NOT",
  "SHALL",
  "SHALL_NOT",
  "MAY",
  "SHOULD",
  "NORMALLY",
  "ENCOURAGED",
]);

/**
 * Stage 2 of the pipeline: structural + semantic validation of a candidate
 * whose provenance already passed. Fail-closed throughout: every branch that
 * cannot find what it needs returns an error rather than substituting a
 * default. There is deliberately no "if missing, assume X" anywhere below.
 */
export function validateRule(candidate: CandidatePolicyRule): Result<ValidatedPolicyRule, ValidationError> {
  const provenanceResult = validateProvenance(candidate);
  if (!provenanceResult.ok) {
    return fail(provenanceResult.errors);
  }

  const errors: ValidationError[] = [];

  if (!candidate.actor || candidate.actor.trim().length === 0) {
    errors.push(err(candidate.id, "actor", "missing actor"));
  }
  if (!candidate.action || candidate.action.trim().length === 0) {
    errors.push(err(candidate.id, "action", "missing action"));
  }

  // Deontic force must be one of the known distinct categories. We do not
  // collapse MAY/SHOULD/NORMALLY/ENCOURAGED into MUST, and an unrecognized
  // string is rejected rather than coerced.
  if (!candidate.deonticForce || !VALID_FORCES.has(candidate.deonticForce)) {
    errors.push(
      err(candidate.id, "deonticForce", `missing or unrecognized deontic force: ${String(candidate.deonticForce)}`)
    );
  }

  // trigger is allowed to be explicitly null (meaning "not yet known") but
  // must not be undefined (meaning "nobody thought about it"). Downstream,
  // a null trigger blocks deadline computation — see procedure/procedureModel.ts.
  if (candidate.trigger === undefined) {
    errors.push(err(candidate.id, "trigger", "trigger must be explicitly provided or explicitly null, not omitted"));
  }

  if (candidate.conditions === undefined) {
    errors.push(err(candidate.id, "conditions", "conditions must be an explicit array (possibly empty)"));
  }

  if (candidate.deadline && candidate.deadline.type === "relative") {
    if (!candidate.deadline.fromEvent || candidate.deadline.fromEvent.trim().length === 0) {
      errors.push(err(candidate.id, "deadline.fromEvent", "relative deadline missing fromEvent"));
    }
    if (!Number.isFinite(candidate.deadline.amount) || candidate.deadline.amount <= 0) {
      errors.push(err(candidate.id, "deadline.amount", "relative deadline amount must be a positive number"));
    }
  }

  if (candidate.deadline && candidate.deadline.type === "derived") {
    const d = candidate.deadline;
    if (!Number.isFinite(d.amount) || d.amount < 0) {
      errors.push(err(candidate.id, "deadline.amount", "derived deadline amount must be a non-negative number"));
    }
    if (d.combinator !== "earliest" && d.combinator !== "latest") {
      errors.push(err(candidate.id, "deadline.combinator", "derived deadline combinator must be 'earliest' or 'latest'"));
    }
    if (!Array.isArray(d.anchors) || d.anchors.length === 0) {
      errors.push(err(candidate.id, "deadline.anchors", "derived deadline requires at least one anchor"));
    } else {
      d.anchors.forEach((anchor, i) => {
        const hasEvent = "fromEvent" in anchor && !!anchor.fromEvent && anchor.fromEvent.trim().length > 0;
        const hasObligation =
          "fromObligationDue" in anchor && !!anchor.fromObligationDue && anchor.fromObligationDue.trim().length > 0;
        if (hasEvent === hasObligation) {
          // both or neither set — ambiguous or empty, reject rather than guess which was intended
          errors.push(
            err(
              candidate.id,
              `deadline.anchors[${i}]`,
              "each anchor must specify exactly one of fromEvent or fromObligationDue"
            )
          );
        }
      });
    }
  }

  if (candidate.groundsList) {
    const gl = candidate.groundsList;
    if (gl.closure === "CLOSED" && (!gl.exhaustivenessEvidence || gl.exhaustivenessEvidence.trim().length === 0)) {
      errors.push(
        err(
          candidate.id,
          "groundsList.closure",
          "closure=CLOSED requires exhaustivenessEvidence quoting source language that affirmatively states the list is exhaustive; " +
            "an enumerated list with no such quote must be OPEN_EXAMPLES or UNKNOWN, never CLOSED by default"
        )
      );
    }
    if (!gl.closure) {
      errors.push(err(candidate.id, "groundsList.closure", "closure is required: CLOSED | OPEN_EXAMPLES | UNKNOWN"));
    }
    if (candidate.groundsPolarity !== "valid" && candidate.groundsPolarity !== "invalid") {
      errors.push(err(candidate.id, "groundsPolarity", "groundsPolarity is required alongside groundsList: 'valid' or 'invalid'"));
    }
  }

  if (errors.length > 0) {
    return fail(errors);
  }

  const validated: ValidatedPolicyRule = Object.freeze({
    id: candidate.id,
    policyId: candidate.policyId,
    kind: candidate.kind,
    provenance: Object.freeze({ ...provenanceResult.value }),
    actor: candidate.actor!,
    action: candidate.action!,
    trigger: candidate.trigger ? Object.freeze({ ...candidate.trigger }) : null,
    conditions: Object.freeze([...(candidate.conditions ?? [])]),
    deonticForce: candidate.deonticForce as DeonticForce,
    deadline: candidate.deadline ? Object.freeze({ ...candidate.deadline }) : undefined,
    groundsList: candidate.groundsList ? Object.freeze({ ...candidate.groundsList }) : undefined,
    groundsPolarity: candidate.groundsPolarity,
    consequenceOfMiss: candidate.consequenceOfMiss,
    authorityLevel: candidate.authorityLevel,
  });

  return ok(validated);
}

/** Validates a batch, partitioning into validated rules and errors. Never throws. */
export function validateRules(
  candidates: CandidatePolicyRule[]
): { validated: ValidatedPolicyRule[]; errors: ValidationError[] } {
  const validated: ValidatedPolicyRule[] = [];
  const errors: ValidationError[] = [];
  for (const c of candidates) {
    const r = validateRule(c);
    if (r.ok) {
      validated.push(r.value);
    } else {
      errors.push(...r.errors);
    }
  }
  return { validated, errors };
}
