import test from "node:test";
import assert from "node:assert/strict";
import { classifySpan, checkDeonticSupport } from "../src/validation/deonticSupport.ts";
import { checkWarrant } from "../src/warrant/warrantValidator.ts";
import { proposeRawAndValidate, type RawClaimProposal } from "../src/warrant/rawProposal.ts";
import { SourceStore, captureSource } from "../src/warrant/sourceStore.ts";
import { baseCandidate } from "./support/helpers.ts";
import type { DeonticForce } from "../src/types/policy.ts";

/**
 * Adversarial tests for the deontic-support gate.
 *
 * The failure this closes is the most dangerous one this system can produce,
 * because it produces a confident, well-cited, verbatim-correct answer that
 * is wrong in the student's favour: an advisory courtesy reported as a
 * binding institutional deadline. Every test below is written from the
 * attacker's side -- "here is a real sentence from a real kind of policy
 * document, and here is the strongest false rule someone could build from it."
 */

const SOURCE_ID = "policy-src";

/** A synthetic policy page carrying, deliberately, every modality at once. */
const POLICY_TEXT = [
  "The Dean's decision should follow promptly on receipt of the panel's recommendation, within 10 business days.",
  "The registrar may extend any deadline in this section.",
  "A department normally responds to a student inquiry within five days.",
  "Students are encouraged to consult an adviser before filing.",
  "The student must file a written appeal within ten (10) days of the decision notice.",
  "The committee shall not consider information outside the record.",
  "Appeals may only be considered if new evidence is presented.",
  "The hearing date will be communicated to the respondent at least five business days prior to the hearing.",
  "Students have 10 academic days from notification to meet with the instructor.",
].join("\n\n");

function store(): SourceStore {
  return new SourceStore([
    captureSource({ sourceId: SOURCE_ID, requestedUrl: "https://example.edu/policy", retrievedAt: "2026-01-01T00:00:00Z", content: POLICY_TEXT }),
  ]);
}

function sentenceOf(fragment: string): string {
  const line = POLICY_TEXT.split("\n\n").find((l) => l.includes(fragment));
  assert.ok(line, `test fixture is missing a line containing "${fragment}"`);
  return line;
}

function proposal(quotedText: string, force: DeonticForce, forceEvidence?: string): RawClaimProposal {
  return {
    rule: baseCandidate({ deonticForce: force }),
    sourceId: SOURCE_ID,
    quotedText,
    claimType: "directly_stated",
    ...(forceEvidence ? { forceEvidence: { quotedText: forceEvidence, claimType: "directly_stated" as const } } : {}),
  };
}

// ---------------------------------------------------------------------------
// The core gap: advisory language may never become binding.
// ---------------------------------------------------------------------------

for (const [label, fragment] of [
  ["SHOULD", "should follow promptly"],
  ["MAY", "may extend any deadline"],
  ["NORMALLY", "normally responds"],
  ["ENCOURAGED", "are encouraged to consult"],
] as const) {
  test(`adversarial: ${label} text quoted verbatim is REFUSED as MUST, not silently promoted`, () => {
    const outcome = proposeRawAndValidate(proposal(sentenceOf(fragment), "MUST"), store());
    assert.equal(outcome.status, "rejected", `${label} text must not compile into a binding rule`);
    if (outcome.status !== "rejected") return;
    assert.ok(
      outcome.errors.some((e) => "field" in e && e.field === "deonticForce"),
      "the refusal must name deonticForce, so the reason is legible rather than looking like a quote failure"
    );
  });

  test(`${label} text encoded honestly as its own force still compiles`, () => {
    const force = ({ SHOULD: "SHOULD", MAY: "MAY", NORMALLY: "NORMALLY", ENCOURAGED: "ENCOURAGED" } as const)[label];
    const outcome = proposeRawAndValidate(proposal(sentenceOf(fragment), force), store());
    assert.equal(outcome.status, "validated", "the gate must not punish an honest advisory encoding");
    if (outcome.status !== "validated") return;
    assert.equal(outcome.rule.deonticForce, force, "the recorded force must be exactly what the source used");
  });
}

test("the four advisory categories stay distinct from each other, not merged into one 'advisory' bucket", () => {
  const forces: DeonticForce[] = ["MAY", "SHOULD", "NORMALLY", "ENCOURAGED"];
  const recorded = forces.map((f) => {
    const outcome = proposeRawAndValidate(proposal(sentenceOf("may extend any deadline"), f), store());
    return outcome.status === "validated" ? outcome.rule.deonticForce : `not-validated:${outcome.status}`;
  });
  assert.deepEqual(recorded, forces);
});

// ---------------------------------------------------------------------------
// Genuinely binding language still works, in both polarities.
// ---------------------------------------------------------------------------

test("explicit MUST language supports a MUST rule", () => {
  const outcome = proposeRawAndValidate(proposal(sentenceOf("must file a written appeal"), "MUST"), store());
  assert.equal(outcome.status, "validated");
});

test("explicit SHALL NOT language supports a SHALL_NOT rule", () => {
  const outcome = proposeRawAndValidate(proposal(sentenceOf("shall not consider information"), "SHALL_NOT"), store());
  assert.equal(outcome.status, "validated");
});

test("restrictive 'may only ... if' is treated as binding, not as permissive MAY", () => {
  const classified = classifySpan(sentenceOf("may only be considered if"));
  assert.ok(
    classified.some((c) => c.modality === "BINDING_RESTRICTIVE"),
    "a restriction on when something may happen is a constraint, not a permission"
  );
  const outcome = proposeRawAndValidate(proposal(sentenceOf("may only be considered if"), "MUST"), store());
  assert.equal(outcome.status, "validated");
});

test("binding language of the WRONG polarity does not support the claimed force; it goes to review", () => {
  const outcome = proposeRawAndValidate(proposal(sentenceOf("must file a written appeal"), "MUST_NOT"), store());
  assert.equal(outcome.status, "needs_review");
});

// ---------------------------------------------------------------------------
// Non-modal language: ambiguous, therefore review -- never guessed either way.
// ---------------------------------------------------------------------------

test("a bare period with no modal verb is held for review, not promoted and not refused", () => {
  const outcome = proposeRawAndValidate(proposal(sentenceOf("Students have 10 academic days"), "MUST"), store());
  assert.equal(outcome.status, "needs_review", "the source neither grants nor requires; the honest answer is 'a human must say'");
  if (outcome.status !== "needs_review") return;
  assert.match(outcome.reason, /could not be deterministically confirmed/);
});

test("'will be communicated' is ambiguous institutional drafting and is held for review, not read as MUST", () => {
  const outcome = proposeRawAndValidate(proposal(sentenceOf("will be communicated"), "MUST"), store());
  assert.equal(outcome.status, "needs_review");
});

// ---------------------------------------------------------------------------
// forceEvidence: a second verified quote, held to the identical standard.
// ---------------------------------------------------------------------------

test("forceEvidence supplies the binding provision when the rule's own span states only the period", () => {
  const outcome = proposeRawAndValidate(
    proposal(sentenceOf("Students have 10 academic days"), "MUST", sentenceOf("must file a written appeal")),
    store()
  );
  assert.equal(outcome.status, "validated", "two verified quotes from the same captured source is more evidence, not less");
});

test("forceEvidence cannot rescue advisory primary evidence — a 'should' span stays refused", () => {
  const outcome = proposeRawAndValidate(
    proposal(sentenceOf("should follow promptly"), "MUST", sentenceOf("must file a written appeal")),
    store()
  );
  assert.equal(
    outcome.status,
    "rejected",
    "quoting a binding sentence from elsewhere must not launder an advisory sentence into a binding rule"
  );
});

test("a fabricated forceEvidence quote is rejected, exactly like a fabricated primary quote", () => {
  const outcome = proposeRawAndValidate(
    proposal(sentenceOf("Students have 10 academic days"), "MUST", "The student must comply with all deadlines without exception."),
    store()
  );
  assert.equal(outcome.status, "rejected");
  if (outcome.status !== "rejected") return;
  assert.ok(outcome.errors.some((e) => "field" in e && String(e.field).includes("forceEvidence")));
});

test("an 'inferred' forceEvidence quote may not establish that a rule is binding", () => {
  const outcome = proposeRawAndValidate(
    {
      ...proposal(sentenceOf("Students have 10 academic days"), "MUST"),
      forceEvidence: { quotedText: sentenceOf("must file a written appeal"), claimType: "inferred" },
    },
    store()
  );
  assert.equal(outcome.status, "needs_review");
});

// ---------------------------------------------------------------------------
// Scope of the gate.
// ---------------------------------------------------------------------------

test("the gate runs at the warrant boundary, so it cannot be bypassed by pre-supplying a warrant", () => {
  const s = store();
  const span = sentenceOf("should follow promptly");
  const start = POLICY_TEXT.indexOf(span);
  const candidate = baseCandidate({
    deonticForce: "MUST",
    warrant: {
      sourceId: SOURCE_ID,
      contentHash: s.get(SOURCE_ID)!.contentHash,
      span: { start, end: start + span.length },
      quotedText: span,
      claimType: "directly_stated",
    },
  });
  assert.equal(checkWarrant(candidate, s).status, "rejected");
});

test("an advisory candidate is not gated at all — claiming less force than a source carries is never a trust gap", () => {
  const outcome = checkDeonticSupport("SHOULD" as DeonticForce, [{ label: "warrant", text: "anything at all" }]);
  assert.equal(outcome.status, "supported");
});

test("sentence scoping: a binding sentence adjacent to an advisory one supports the binding claim", () => {
  const span = "Appeals may only be considered if new evidence is presented. This new information must have been unknown at the time.";
  const outcome = checkDeonticSupport("MUST" as DeonticForce, [{ label: "warrant", text: span }]);
  assert.equal(outcome.status, "supported");
});

test("markup and HTML entities in a captured span do not hide the modality from the gate", () => {
  const outcome = checkDeonticSupport("MUST" as DeonticForce, [
    { label: "warrant", text: "<p>The decision&nbsp;<b>should</b> follow promptly.</p>" },
  ]);
  assert.equal(outcome.status, "contradicted", "an advisory word wrapped in tags is still an advisory word");
});
