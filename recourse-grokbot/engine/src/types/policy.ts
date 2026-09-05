/**
 * Policy rule model.
 *
 * A "candidate" rule is whatever an LLM (or a human transcriber) proposed after
 * reading a policy page. It is untrusted input. It becomes a "validated" rule
 * only by passing through validation/provenanceValidator.ts and
 * validation/ruleValidator.ts — there is no other constructor for a
 * ValidatedPolicyRule, and nothing downstream (procedure model, case engine,
 * deviation detector) accepts a CandidatePolicyRule.
 */

/** Deontic force, kept distinct on purpose — see ARCHITECTURE decision in validation/ruleValidator.ts. */
export type DeonticForce =
  | "MUST"
  | "MUST_NOT"
  | "SHALL"
  | "SHALL_NOT"
  | "MAY"
  | "SHOULD"
  | "NORMALLY"
  | "ENCOURAGED";

/** MAY/SHOULD/NORMALLY/ENCOURAGED are advisory; only these two create a binding obligation. */
export const BINDING_FORCES: ReadonlySet<DeonticForce> = new Set(["MUST", "MUST_NOT", "SHALL", "SHALL_NOT"]);

export interface Provenance {
  /** Authoritative source URL the rule was read from. Not a search-engine result page. */
  sourceUrl: string;
  /** ISO 8601 timestamp of when the source was retrieved. */
  retrievedAt: string;
  /** The exact quoted span (or a precise section/paragraph anchor) supporting this rule. */
  sourceSpan: string;
  /** Who is bound or empowered by this rule (e.g. "student", "registrar", "appeals committee"). */
  actor: string;
}

export type TimeUnit = "calendar_day" | "business_day";

/**
 * A single anchor a derived deadline can be measured from: either a logged
 * case event, or the (already-computed) due date of another obligation in
 * the same procedure. The latter is what lets the engine express a rule like
 * UIC's Student Academic Grievance Procedures, Section IV.A.4: "Limitations
 * imposed upon the Grievant for filing appeals of decisions will be
 * calculated from the date that any decision is received by the Grievant,
 * OR IS DUE, whichever date is earlier." That is not a single logged event —
 * it is a derived date depending on another obligation's own deadline.
 */
export type DeadlineAnchor = { fromEvent: string } | { fromObligationDue: string };

export type DeadlineSpec =
  | { type: "unspecified" }
  | { type: "relative"; amount: number; unit: TimeUnit; fromEvent: string }
  | { type: "absolute"; datetime: string }
  | {
      /**
       * A compound/derived deadline: resolve each anchor in `anchors` to a
       * date (an event's occurredAt, or another obligation's computed due
       * date), combine them with `combinator`, then add `amount` days of
       * `unit` to the combined anchor date. `combinator: "earliest"` /
       * "latest" pick the earliest/latest resolvable anchor date; if an
       * anchor cannot yet be resolved (its event hasn't happened, or the
       * referenced obligation is itself still "unknown"), it is skipped —
       * the deadline resolves once at least one anchor resolves, exactly
       * mirroring the source language above ("whichever date is earlier").
       */
      type: "derived";
      amount: number;
      unit: TimeUnit;
      combinator: "earliest" | "latest";
      anchors: DeadlineAnchor[];
    };

export interface ConditionSpec {
  id: string;
  description: string;
}

export interface TriggerSpec {
  /** The event/decision type this rule applies when. */
  eventType: string;
  /** Optional narrowing conditions. */
  conditions?: ConditionSpec[];
}

/**
 * How a list of items (grounds, evidence types, etc.) should be read.
 * Replaces an unsafe `exhaustive: boolean` design: a boolean silently defaults
 * to one meaning when omitted, and nothing forces the evidence that would
 * justify "closed" over "just what we happened to enumerate."
 */
export type ListClosure = "CLOSED" | "OPEN_EXAMPLES" | "UNKNOWN";

export interface GroundsList {
  ids: string[];
  closure: ListClosure;
  /**
   * Required when closure === "CLOSED". Must point at source language that
   * affirmatively states the list is exhaustive (e.g. "the only grounds are...").
   * Absence of "or other good cause" is NOT sufficient evidence on its own —
   * that is an inference, not a quote.
   */
  exhaustivenessEvidence?: string;
}

export type RuleKind =
  | "obligation" // an actor must/may do something, possibly under a deadline
  | "eligibility_grounds" // defines a GroundsList
  | "evidence_requirement"
  | "escalation_path"
  | "terminal_state";

export interface CandidatePolicyRuleBase {
  id: string;
  policyId: string;
  kind: RuleKind;
  provenance: Partial<Provenance> | undefined;
  /**
   * Pointer into a captured, content-hashed SourceArtifact, checked by
   * warrant/warrantValidator.ts before this candidate ever reaches
   * validation/provenanceValidator.ts. Optional on the type because this is
   * untrusted input and may simply be missing -- the warrant checker treats
   * a missing warrant as an automatic reject, it never substitutes a default.
   */
  warrant?: import("./warrant.ts").EvidenceWarrant;
  actor: string | undefined;
  action: string | undefined;
  trigger: TriggerSpec | null | undefined;
  conditions: ConditionSpec[] | undefined;
  deonticForce: DeonticForce | undefined;
  deadline?: DeadlineSpec;
  groundsList?: GroundsList;
  /** Required alongside groundsList: is this list of grounds valid (qualifying) or explicitly invalid (excluded)? */
  groundsPolarity?: "valid" | "invalid";
  consequenceOfMiss?: string;
  authorityLevel?: "campus_wide" | "college_level" | "department_level" | "program_level";
}

/** Untrusted input — may be missing required fields. This is the only shape an LLM may emit. */
export type CandidatePolicyRule = CandidatePolicyRuleBase;

/**
 * A rule that has passed provenance + structural validation. Frozen at
 * construction. There is no exported function anywhere in this codebase that
 * mutates a ValidatedPolicyRule's deonticForce, groundsList.closure, or
 * provenance after validation — the type is only ever built once, by
 * validation/ruleValidator.ts#validateRule.
 */
export interface ValidatedPolicyRule {
  readonly id: string;
  readonly policyId: string;
  readonly kind: RuleKind;
  readonly provenance: Readonly<Provenance>;
  readonly actor: string;
  readonly action: string;
  readonly trigger: Readonly<TriggerSpec> | null;
  readonly conditions: ReadonlyArray<ConditionSpec>;
  readonly deonticForce: DeonticForce;
  readonly deadline?: Readonly<DeadlineSpec>;
  readonly groundsList?: Readonly<GroundsList>;
  readonly groundsPolarity?: "valid" | "invalid";
  readonly consequenceOfMiss?: string;
  readonly authorityLevel?: "campus_wide" | "college_level" | "department_level" | "program_level";
}
