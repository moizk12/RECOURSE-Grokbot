import type { CandidatePolicyRule, Provenance } from "../types/policy.ts";
import type { ValidationError } from "./errors.ts";
import { err } from "./errors.ts";
import { type Result, ok, fail } from "../types/result.ts";

const URL_RE = /^https?:\/\/[^\s]+$/i;
const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Provenance validation is stage 1 of the pipeline and runs before any other
 * structural check. A rule with missing or malformed provenance is rejected
 * here, unconditionally — no downstream stage ever sees it, and no field is
 * filled in with a "reasonable assumption."
 */
export function validateProvenance(candidate: CandidatePolicyRule): Result<Provenance, ValidationError> {
  const p = candidate.provenance;
  const errors: ValidationError[] = [];

  if (!p) {
    return fail([err(candidate.id, "provenance", "provenance is missing entirely")]);
  }

  if (!p.sourceUrl || !URL_RE.test(p.sourceUrl)) {
    errors.push(err(candidate.id, "provenance.sourceUrl", "missing or not a valid http(s) URL"));
  }
  if (!p.retrievedAt || !ISO_DATETIME_RE.test(p.retrievedAt)) {
    errors.push(err(candidate.id, "provenance.retrievedAt", "missing or not an ISO 8601 timestamp"));
  }
  if (!p.sourceSpan || p.sourceSpan.trim().length === 0) {
    errors.push(err(candidate.id, "provenance.sourceSpan", "missing quoted source span / anchor"));
  }
  if (!p.actor || p.actor.trim().length === 0) {
    errors.push(err(candidate.id, "provenance.actor", "missing actor"));
  }

  if (errors.length > 0) {
    return fail(errors);
  }

  return ok({
    sourceUrl: p.sourceUrl!,
    retrievedAt: p.retrievedAt!,
    sourceSpan: p.sourceSpan!,
    actor: p.actor!,
  });
}
