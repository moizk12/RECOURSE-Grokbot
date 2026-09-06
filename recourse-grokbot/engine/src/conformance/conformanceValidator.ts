import type { CandidateConformanceRule, ConformanceRuleError, ValidatedConformanceRule } from "../types/conformance.ts";
import type { EvidenceWarrant } from "../types/warrant.ts";
import type { SourceStore } from "../warrant/sourceStore.ts";

export function cerr(ruleId: string, field: string, message: string): ConformanceRuleError {
  return { ruleId, field, message };
}

export type ConformanceWarrantOutcome =
  | { readonly status: "auto_promotable"; readonly rule: ValidatedConformanceRule }
  | { readonly status: "needs_review"; readonly candidate: CandidateConformanceRule; readonly reason: string }
  | { readonly status: "rejected"; readonly errors: ConformanceRuleError[] };

function validateConstraintShape(candidateId: string, constraint: NonNullable<CandidateConformanceRule["constraint"]>): ConformanceRuleError[] {
  const errors: ConformanceRuleError[] = [];

  if (constraint.kind === "required_event") {
    if (!constraint.eventType || constraint.eventType.trim().length === 0) {
      errors.push(cerr(candidateId, "constraint.eventType", "missing eventType"));
    }
    return errors;
  }

  if (constraint.kind === "required_before") {
    if (!constraint.eventType || constraint.eventType.trim().length === 0) {
      errors.push(cerr(candidateId, "constraint.eventType", "missing eventType"));
    }
    if (!constraint.beforeEventType || constraint.beforeEventType.trim().length === 0) {
      errors.push(cerr(candidateId, "constraint.beforeEventType", "missing beforeEventType"));
    }
    if (constraint.eventType && constraint.beforeEventType && constraint.eventType === constraint.beforeEventType) {
      errors.push(cerr(candidateId, "constraint.beforeEventType", "eventType and beforeEventType must be different event types"));
    }
    return errors;
  }

  if (constraint.kind === "minimum_lead_time") {
    if (!constraint.anchorEventType || constraint.anchorEventType.trim().length === 0) {
      errors.push(cerr(candidateId, "constraint.anchorEventType", "missing anchorEventType"));
    }
    if (!constraint.targetEventType || constraint.targetEventType.trim().length === 0) {
      errors.push(cerr(candidateId, "constraint.targetEventType", "missing targetEventType"));
    }
    if (constraint.anchorEventType && constraint.targetEventType && constraint.anchorEventType === constraint.targetEventType) {
      errors.push(cerr(candidateId, "constraint.targetEventType", "anchorEventType and targetEventType must be different event types"));
    }
    if (!constraint.minimum || !Number.isFinite(constraint.minimum.amount) || constraint.minimum.amount <= 0) {
      errors.push(cerr(candidateId, "constraint.minimum.amount", "minimum.amount must be a positive number"));
    }
    if (!constraint.minimum || (constraint.minimum.unit !== "calendar_day" && constraint.minimum.unit !== "business_day")) {
      errors.push(cerr(candidateId, "constraint.minimum.unit", "minimum.unit must be 'calendar_day' or 'business_day'"));
    }
    return errors;
  }

  return [cerr(candidateId, "constraint.kind", `unrecognized constraint kind: ${String((constraint as { kind?: unknown }).kind)}`)];
}

/**
 * Stage for procedural conformance rules, structurally and evidentially
 * equivalent to validation/ruleValidator.ts + warrant/warrantValidator.ts
 * combined: a candidate must supply a responsible actor, an internally
 * well-formed constraint, and a warrant that is verified -- deterministically,
 * offline -- against a previously captured SourceArtifact. The warrant must
 * be anchored in the rule's own declared `sourceId`; a warrant citing a
 * different source is rejected, not silently accepted.
 *
 * Only "directly_stated" candidates with a verified span are
 * auto-promotable. "inferred" candidates fail into review -- an LLM's
 * reading of a procedure is never, by itself, sufficient to make a
 * conformance rule executable.
 *
 * This function does not know about authority resolution -- see
 * conformance/conformancePipeline.ts, which gates entry to this function
 * on the rule's source having already cleared authority/authorityResolver.ts.
 */
export function validateConformanceRule(candidate: CandidateConformanceRule, store: SourceStore): ConformanceWarrantOutcome {
  const errors: ConformanceRuleError[] = [];

  if (!candidate.sourceId || candidate.sourceId.trim().length === 0) {
    errors.push(cerr(candidate.id, "sourceId", "missing sourceId"));
  }
  if (!candidate.actor || candidate.actor.trim().length === 0) {
    errors.push(cerr(candidate.id, "actor", "missing actor"));
  }
  if (!candidate.constraint) {
    errors.push(cerr(candidate.id, "constraint", "missing constraint"));
  } else {
    errors.push(...validateConstraintShape(candidate.id, candidate.constraint));
  }

  // An exception is optional, but a half-specified one is not tolerated: it
  // would degrade into "a waiver exists and there is no stated way to rule it
  // in or out", which leaves every finding on this rule permanently
  // unresolvable -- worse than not modelling it at all.
  const ex = candidate.exception;
  if (ex) {
    if (!ex.id || ex.id.trim().length === 0) {
      errors.push(cerr(candidate.id, "exception.id", "missing exception id"));
    }
    if (!ex.description || ex.description.trim().length === 0) {
      errors.push(cerr(candidate.id, "exception.description", "missing plain-language description of the exception"));
    }
    if (!ex.establishedByEventType || ex.establishedByEventType.trim().length === 0) {
      errors.push(
        cerr(candidate.id, "exception.establishedByEventType", "missing the event type that establishes the exception applies")
      );
    }
    if (!ex.negatedByEventType || ex.negatedByEventType.trim().length === 0) {
      errors.push(
        cerr(
          candidate.id,
          "exception.negatedByEventType",
          "missing the event type that affirmatively rules the exception out -- required, because without it the only route back to a violation finding would be assuming the exception did not occur from the fact that nothing recorded it"
        )
      );
    }
    if (ex.establishedByEventType && ex.negatedByEventType && ex.establishedByEventType === ex.negatedByEventType) {
      errors.push(
        cerr(candidate.id, "exception.negatedByEventType", "establishedByEventType and negatedByEventType must be different event types")
      );
    }
  }

  if (errors.length > 0) {
    return { status: "rejected", errors };
  }

  const w = candidate.warrant;
  if (!w) {
    return { status: "rejected", errors: [cerr(candidate.id, "warrant", "warrant is missing entirely")] };
  }

  if (!w.sourceId || w.sourceId.trim().length === 0) {
    errors.push(cerr(candidate.id, "warrant.sourceId", "missing source id"));
  }
  if (!w.quotedText || w.quotedText.length === 0) {
    errors.push(cerr(candidate.id, "warrant.quotedText", "missing quoted text"));
  }
  if (
    !w.span ||
    !Number.isInteger(w.span.start) ||
    !Number.isInteger(w.span.end) ||
    w.span.start < 0 ||
    w.span.end <= w.span.start
  ) {
    errors.push(
      cerr(candidate.id, "warrant.span", "missing or ambiguous span: start/end must be integers with end > start >= 0")
    );
  }
  if (w.claimType !== "directly_stated" && w.claimType !== "inferred") {
    errors.push(cerr(candidate.id, "warrant.claimType", `missing or unrecognized claimType: ${String(w.claimType)}`));
  }
  if (!w.contentHash || w.contentHash.trim().length === 0) {
    errors.push(cerr(candidate.id, "warrant.contentHash", "missing content hash"));
  }

  if (errors.length > 0) {
    return { status: "rejected", errors };
  }

  if (w.sourceId !== candidate.sourceId) {
    return {
      status: "rejected",
      errors: [
        cerr(
          candidate.id,
          "warrant.sourceId",
          `conformance rule warrant must be anchored in its own declared sourceId -- warrant cites '${w.sourceId}' but sourceId is '${candidate.sourceId}'`
        ),
      ],
    };
  }

  const source = store.get(w.sourceId);
  if (!source) {
    return {
      status: "rejected",
      errors: [cerr(candidate.id, "warrant.sourceId", `no captured source artifact found for source id '${w.sourceId}'`)],
    };
  }

  if (source.contentHash !== w.contentHash) {
    return {
      status: "rejected",
      errors: [
        cerr(
          candidate.id,
          "warrant.contentHash",
          `content hash mismatch: candidate pins '${w.contentHash}' but captured source '${w.sourceId}' has '${source.contentHash}' -- source has changed since capture, or the wrong hash was cited`
        ),
      ],
    };
  }

  const { start, end } = w.span;
  if (end > source.content.length) {
    return {
      status: "rejected",
      errors: [
        cerr(
          candidate.id,
          "warrant.span",
          `span [${start}, ${end}) is out of bounds for source '${w.sourceId}' (captured content length ${source.content.length})`
        ),
      ],
    };
  }

  const actualSpanText = source.content.slice(start, end);
  if (actualSpanText !== w.quotedText) {
    return {
      status: "rejected",
      errors: [
        cerr(
          candidate.id,
          "warrant.quotedText",
          `cited evidence could not be confirmed: candidate quotes '${w.quotedText}' at [${start}, ${end}), but the captured source actually has '${actualSpanText}' there`
        ),
      ],
    };
  }

  if (w.claimType === "inferred") {
    return {
      status: "needs_review",
      candidate,
      reason:
        "evidence span verified against the captured source, but claimType is 'inferred' -- an inferred procedural claim requires human review and is never auto-promoted into an executable conformance rule",
    };
  }

  // The exception must be quoted from the source like everything else. A
  // waiver asserted without verified source text would be exactly the kind of
  // unwarranted claim this layer refuses -- and it excuses an institution,
  // which is the direction an error hurts a student most.
  if (ex) {
    const ew = ex.warrant;
    if (!ew) {
      return {
        status: "rejected",
        errors: [cerr(candidate.id, "exception.warrant", "an exception must carry its own verified warrant quoting the source text that creates it")],
      };
    }
    if (ew.sourceId !== candidate.sourceId) {
      return {
        status: "rejected",
        errors: [
          cerr(
            candidate.id,
            "exception.warrant.sourceId",
            `an exception must be warranted in the rule's own declared sourceId -- warrant cites '${ew.sourceId}' but sourceId is '${candidate.sourceId}'`
          ),
        ],
      };
    }
    const exErrors = verifyNonPrimarySpan(candidate.id, "exception.warrant", ew, store);
    if (exErrors.length > 0) {
      return { status: "rejected", errors: exErrors };
    }
    if (ew.claimType === "inferred") {
      return {
        status: "needs_review",
        candidate,
        reason:
          "exception span verified against the captured source, but its claimType is 'inferred' -- an inferred reading may not establish that a requirement is waivable",
      };
    }
  }

  return {
    status: "auto_promotable",
    rule: Object.freeze({
      id: candidate.id,
      sourceId: candidate.sourceId!,
      actor: candidate.actor!,
      constraint: Object.freeze({ ...candidate.constraint! }),
      warrant: Object.freeze({ ...w }),
      ...(ex ? { exception: Object.freeze({ ...ex, warrant: Object.freeze({ ...ex.warrant! }) }) } : {}),
    }),
  };
}

/**
 * Span verification for a warrant that is not the rule's primary one (today:
 * an exception's). Structurally identical to the primary checks above, kept
 * here so the exception's evidence is held to exactly that standard rather
 * than to a looser second implementation.
 */
function verifyNonPrimarySpan(
  ruleId: string,
  field: string,
  w: EvidenceWarrant,
  store: SourceStore
): ConformanceRuleError[] {
  if (!w.quotedText || w.quotedText.length === 0) {
    return [cerr(ruleId, `${field}.quotedText`, "missing quoted text")];
  }
  if (!w.span || !Number.isInteger(w.span.start) || !Number.isInteger(w.span.end) || w.span.start < 0 || w.span.end <= w.span.start) {
    return [cerr(ruleId, `${field}.span`, "missing or ambiguous span: start/end must be integers with end > start >= 0")];
  }
  if (w.claimType !== "directly_stated" && w.claimType !== "inferred") {
    return [cerr(ruleId, `${field}.claimType`, `missing or unrecognized claimType: ${String(w.claimType)}`)];
  }
  const source = store.get(w.sourceId);
  if (!source) {
    return [cerr(ruleId, `${field}.sourceId`, `no captured source artifact found for source id '${w.sourceId}'`)];
  }
  if (source.contentHash !== w.contentHash) {
    return [
      cerr(
        ruleId,
        `${field}.contentHash`,
        `content hash mismatch: candidate pins '${w.contentHash}' but captured source '${w.sourceId}' has '${source.contentHash}' -- source has changed since capture, or the wrong hash was cited`
      ),
    ];
  }
  if (w.span.end > source.content.length) {
    return [
      cerr(
        ruleId,
        `${field}.span`,
        `span [${w.span.start}, ${w.span.end}) is out of bounds for source '${w.sourceId}' (captured content length ${source.content.length})`
      ),
    ];
  }
  const actual = source.content.slice(w.span.start, w.span.end);
  if (actual !== w.quotedText) {
    return [
      cerr(
        ruleId,
        `${field}.quotedText`,
        `cited evidence could not be confirmed: candidate quotes '${w.quotedText}' at [${w.span.start}, ${w.span.end}), but the captured source actually has '${actual}' there`
      ),
    ];
  }
  return [];
}
