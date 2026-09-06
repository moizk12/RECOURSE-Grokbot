import type { DeonticForce } from "../types/policy.ts";
import { BINDING_FORCES } from "../types/policy.ts";

/**
 * Deontic support: does a cited source span actually carry the modality the
 * candidate claims for it?
 *
 * ## The gap this closes
 *
 * warrant/warrantValidator.ts proves that a quoted span EXISTS verbatim in a
 * captured source. It cannot prove that the span SAYS what the candidate says
 * it says. That gap has one specific, high-consequence instance: a proposer
 * reads "the committee should normally respond within ten days", encodes
 * `deonticForce: "MUST"`, and quotes the sentence accurately. Every existing
 * check passes -- right source id, right hash, right offsets, text correct
 * character for character -- and an advisory courtesy silently becomes a
 * binding institutional deadline a student may then rely on. That is the
 * worst output this system can produce, because it is the one that looks most
 * like a correct answer.
 *
 * ## What this is, and what it deliberately is not
 *
 * This is a DETERMINISTIC LEXICAL MODALITY CHECK over the words of the cited
 * span. It is not natural-language entailment. It does not parse, it does not
 * resolve which clause binds which actor, it does not know what the provision
 * means, and it is not claimed to. It answers exactly one question: taken
 * sentence by sentence, does the modal vocabulary actually present in this
 * quotation deterministically support a BINDING reading, deterministically
 * contradict one, or neither?
 *
 * Three properties make that narrow question worth asking:
 *
 *   1. It is a NECESSARY condition, not a sufficient one. A rule that clears
 *      this gate is not thereby "understood" -- it has merely been stopped
 *      from being the one specific fabrication above.
 *   2. It is scoped to SENTENCES, because policy provisions routinely put a
 *      permission and a requirement in adjacent sentences ("Appeals may only
 *      be considered if… This new information must have been unknown…"), and
 *      a span-wide bag of words cannot tell those apart. A binding claim is
 *      supported by a sentence that is binding, not by a document that
 *      contains the word "must" somewhere.
 *   3. It fails closed in both directions. Advisory-only evidence is REFUSED.
 *      Evidence with no modal verb at all, or with modality it cannot resolve,
 *      is HELD FOR REVIEW -- never guessed either way.
 *
 * ## The known limit, stated rather than hidden
 *
 * Because it works on lexical modality within a sentence, a span whose
 * binding sentence is about a DIFFERENT obligation than the one encoded will
 * still satisfy the gate. That is a real residual weakness and it is the
 * price of not pretending to do entailment. What the gate guarantees is
 * narrower and checkable: no rule reaches a binding force on evidence whose
 * modal vocabulary is purely advisory, and no rule reaches one on evidence
 * with no modal vocabulary at all.
 *
 * The gate applies ONLY to candidates claiming a binding force
 * (types/policy.ts#BINDING_FORCES). A candidate claiming MAY/SHOULD/NORMALLY/
 * ENCOURAGED is not gated: claiming LESS force than a source carries creates
 * no trust gap, and gating it would push honestly-encoded advisory rules into
 * review for no safety gain.
 */

/** What one sentence's modal vocabulary supports, by itself. */
export type SentenceModality =
  /** Binding, affirmative: "must", "shall", "is required to". */
  | "BINDING_POSITIVE"
  /** Binding, prohibitive: "must not", "shall not", "is prohibited". */
  | "BINDING_NEGATIVE"
  /**
   * Binding, restrictive: "may only be considered if", "shall only be granted
   * where". Restrictive language is genuinely binding and genuinely
   * two-faced -- "X may only happen if Y" is both a requirement of Y and a
   * prohibition otherwise -- so it supports a binding claim of either
   * polarity rather than being forced into one.
   */
  | "BINDING_RESTRICTIVE"
  /** Advisory only: "should", "may", "normally", "encouraged", "recommended". */
  | "ADVISORY"
  /** Binding and advisory vocabulary in the SAME sentence -- not decidable here. */
  | "MIXED"
  /** No recognized modal vocabulary -- e.g. "will be communicated", "is issued", "has 10 days". */
  | "NONE";

export interface SentenceClassification {
  readonly sentence: string;
  readonly modality: SentenceModality;
  /** The recognized modal phrases actually found, lowercased. Reported so a reviewer can see what drove the outcome. */
  readonly markers: ReadonlyArray<string>;
}

/**
 * Restrictive constructions. Drained FIRST: every one contains a shorter
 * phrase from a later list ("may only" contains "may"), and consuming the
 * longer match first is what keeps classification unambiguous.
 */
const RESTRICTIVE_PATTERNS: ReadonlyArray<RegExp> = [
  /\bmay\s+only\b/g,
  /\bshall\s+only\b/g,
  /\bmust\s+only\b/g,
  /\bwill\s+only\s+be\b/g,
  /\bonly\s+if\b/g,
  /\bonly\s+where\b/g,
  /\bonly\s+be\s+considered\s+if\b/g,
];

/** Prohibitive binding phrases. Drained before the affirmative list ("must not" contains "must"). */
const BINDING_NEGATIVE_PATTERNS: ReadonlyArray<RegExp> = [
  /\bmust\s+not\b/g,
  /\bmust\s+never\b/g,
  /\bshall\s+not\b/g,
  /\bshall\s+never\b/g,
  /\bmay\s+not\b/g,
  /\bis\s+prohibited\b/g,
  /\bare\s+prohibited\b/g,
  /\bis\s+not\s+permitted\b/g,
  /\bare\s+not\s+permitted\b/g,
];

/**
 * Advisory-negative phrases, drained before the affirmative binding list for
 * the same reason: "should not" contains "should", and a discouragement must
 * never be read as a prohibition of the binding kind.
 */
const ADVISORY_NEGATIVE_PATTERNS: ReadonlyArray<RegExp> = [
  /\bshould\s+not\b/g,
  /\bis\s+discouraged\b/g,
  /\bare\s+discouraged\b/g,
];

const BINDING_POSITIVE_PATTERNS: ReadonlyArray<RegExp> = [
  /\bmust\b/g,
  /\bshall\b/g,
  /\bis\s+required\s+to\b/g,
  /\bare\s+required\s+to\b/g,
  /\bis\s+required\b/g,
  /\bare\s+required\b/g,
  /\brequired\s+to\b/g,
  /\bis\s+obligated\s+to\b/g,
  /\bare\s+obligated\s+to\b/g,
];

const ADVISORY_PATTERNS: ReadonlyArray<RegExp> = [
  /\bshould\b/g,
  /\bmay\b/g,
  /\bnormally\b/g,
  /\bordinarily\b/g,
  /\btypically\b/g,
  /\busually\b/g,
  /\bgenerally\b/g,
  /\bencouraged\b/g,
  /\bencourages\b/g,
  /\brecommended\b/g,
  /\brecommends\b/g,
  /\bis\s+advised\b/g,
  /\bare\s+advised\b/g,
  /\bsuggested\b/g,
  /\bpreferably\b/g,
  /\bwhere\s+possible\b/g,
  /\bif\s+possible\b/g,
  /\bat\s+their\s+discretion\b/g,
  /\bat\s+its\s+discretion\b/g,
];

/**
 * Captured HTML sources are stored as served (the HTML extractor is the
 * identity extractor -- see warrant/acquireSource.ts), so a span lifted from
 * one legitimately contains entities and tags. Normalizing them is about
 * reading the words; it never changes what was verified, because span
 * verification already happened against the untouched captured content.
 */
function normalize(text: string): string {
  return text
    .replace(/&nbsp;|&#160;|&#xa0;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#8217;|&rsquo;/gi, "'")
    .replace(/<[^>]*>/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Sentence-ish segmentation. Deliberately crude and deliberately
 * over-segmenting: splitting a provision into more pieces can only make the
 * gate stricter about what counts as a binding sentence, never looser, so an
 * imperfect split never manufactures support that is not there.
 */
function toSentences(normalized: string): string[] {
  return normalized
    .split(/(?<=[.;:!?])\s+|\s*[•·]\s*|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function drain(text: string, patterns: ReadonlyArray<RegExp>, found: string[]): string {
  let out = text;
  for (const pattern of patterns) {
    out = out.replace(new RegExp(pattern.source, "g"), (match) => {
      found.push(match.replace(/\s+/g, " "));
      // Replaced with a space, never removed, so neighbouring words cannot be
      // fused into a phrase that was not in the source.
      return " ";
    });
  }
  return out;
}

/** Classifies one already-normalized sentence. Pure and order-independent in its result. */
function classifySentence(sentence: string): SentenceClassification {
  const restrictive: string[] = [];
  const bindingNegative: string[] = [];
  const advisoryNegative: string[] = [];
  const bindingPositive: string[] = [];
  const advisory: string[] = [];

  let remaining = sentence;
  remaining = drain(remaining, RESTRICTIVE_PATTERNS, restrictive);
  remaining = drain(remaining, BINDING_NEGATIVE_PATTERNS, bindingNegative);
  remaining = drain(remaining, ADVISORY_NEGATIVE_PATTERNS, advisoryNegative);
  remaining = drain(remaining, BINDING_POSITIVE_PATTERNS, bindingPositive);
  drain(remaining, ADVISORY_PATTERNS, advisory);

  const allAdvisory = [...advisoryNegative, ...advisory];
  const markers = [...restrictive, ...bindingNegative, ...bindingPositive, ...allAdvisory];
  const hasBinding = restrictive.length > 0 || bindingNegative.length > 0 || bindingPositive.length > 0;

  if (hasBinding && allAdvisory.length > 0) return { sentence, modality: "MIXED", markers };
  if (allAdvisory.length > 0) return { sentence, modality: "ADVISORY", markers };
  if (restrictive.length > 0) return { sentence, modality: "BINDING_RESTRICTIVE", markers };
  if (bindingNegative.length > 0 && bindingPositive.length > 0) return { sentence, modality: "MIXED", markers };
  if (bindingNegative.length > 0) return { sentence, modality: "BINDING_NEGATIVE", markers };
  if (bindingPositive.length > 0) return { sentence, modality: "BINDING_POSITIVE", markers };
  return { sentence, modality: "NONE", markers };
}

/** Classifies every sentence of a span. Exported for tests and for reporting. */
export function classifySpan(spanText: string): SentenceClassification[] {
  return toSentences(normalize(spanText)).map(classifySentence);
}

export type DeonticSupportOutcome =
  /** At least one verified sentence carries binding modality consistent with the claimed force. */
  | { readonly status: "supported"; readonly modality: SentenceModality; readonly markers: ReadonlyArray<string>; readonly sentence: string }
  /** Every sentence carrying modality at all is advisory. A binding claim over that evidence is refused outright. */
  | { readonly status: "contradicted"; readonly reason: string }
  /** Nothing verified deterministically supports the claimed force. Held for human review, never guessed. */
  | { readonly status: "unsupported"; readonly reason: string };

function supportsForce(force: DeonticForce, modality: SentenceModality): boolean {
  if (modality === "BINDING_RESTRICTIVE") return true;
  const prohibitive = force === "MUST_NOT" || force === "SHALL_NOT";
  return prohibitive ? modality === "BINDING_NEGATIVE" : modality === "BINDING_POSITIVE";
}

/**
 * The gate itself.
 *
 * `spans` is every span already VERIFIED against the captured source for this
 * rule: its own warrant, plus an optional dedicated force-evidence warrant
 * for the common drafting pattern where the sentence stating the period or
 * the anchor is not the sentence stating that the step is required at all.
 * Both are real, checked quotations from the same governing document.
 * Neither is a paraphrase, and neither was supplied with a hash or an offset.
 *
 * Resolution order, fail-closed and independent of which span came first:
 *
 *   1. SUPPORTED  -- some sentence in some verified span is binding with a
 *      polarity consistent with the claimed force.
 *   2. CONTRADICTED -- otherwise, if some sentence is advisory and NO sentence
 *      anywhere carries binding modality, the claim is refused. This is the
 *      SHOULD/MAY/NORMALLY/ENCOURAGED -> MUST promotion the gate exists for.
 *   3. UNSUPPORTED -- otherwise held for review: no modal vocabulary at all,
 *      binding vocabulary of the wrong polarity, or modality mixed inside
 *      every sentence that has any. The provision may well be binding; this
 *      engine cannot establish that, and says so instead of deciding.
 */
export function checkDeonticSupport(
  force: DeonticForce,
  spans: ReadonlyArray<{ readonly label: string; readonly text: string }>
): DeonticSupportOutcome {
  if (!BINDING_FORCES.has(force)) {
    return { status: "supported", modality: "NONE", markers: [], sentence: "" };
  }
  if (spans.length === 0) {
    return {
      status: "unsupported",
      reason: "no verified source span was available to check the claimed binding force against",
    };
  }

  const perSpan = spans.map((s) => ({ label: s.label, sentences: classifySpan(s.text) }));

  // Contradiction is evaluated PER SPAN, and it beats support found in a
  // different span. A span whose only modality is advisory is evidence that
  // the provision it quotes is advisory; pairing it with a binding sentence
  // lifted from elsewhere in the document does not make that provision
  // binding, it launders it. Refusing here is what keeps forceEvidence a way
  // to satisfy the gate honestly rather than a way around it.
  for (const span of perSpan) {
    const hasBinding = span.sentences.some(
      (c) => c.modality === "BINDING_POSITIVE" || c.modality === "BINDING_NEGATIVE" || c.modality === "BINDING_RESTRICTIVE"
    );
    const advisorySentences = span.sentences.filter((c) => c.modality === "ADVISORY");
    if (!hasBinding && advisorySentences.length > 0) {
      const shown = advisorySentences.map((c) => `"${c.sentence}" [${c.markers.join(", ")}]`).join("; ");
      return {
        status: "contradicted",
        reason:
          `deontic force '${force}' is refused: the verified ${span.label} span carries advisory modality and no binding modality -- ${shown}. ` +
          `SHOULD/MAY/NORMALLY/ENCOURAGED language cannot be promoted to a binding obligation, and quoting a binding sentence ` +
          `from elsewhere in the same document does not change what this provision says. ` +
          `Encode the advisory force the source actually uses, or cite the provision that states the requirement in binding terms.`,
      };
    }
  }

  const classified = perSpan.flatMap((s) => s.sentences.map((c) => ({ ...c, label: s.label })));

  const supporting = classified.find((c) => supportsForce(force, c.modality));
  if (supporting) {
    return {
      status: "supported",
      modality: supporting.modality,
      markers: supporting.markers,
      sentence: supporting.sentence,
    };
  }

  const summary = classified
    .map((c) => `${c.label}: ${c.modality}${c.markers.length > 0 ? ` (${c.markers.join(", ")})` : ""}`)
    .join("; ");

  return {
    status: "unsupported",
    reason:
      `deontic force '${force}' could not be deterministically confirmed from the cited evidence -- ${summary}. ` +
      `This is a lexical modality check, not an interpretation of the provision: evidence with no modal verb, ` +
      `with binding language only of the opposite polarity, or with modality mixed inside every sentence is held for ` +
      `human review rather than guessed at. To make this executable, cite the provision that states the requirement ` +
      `in binding terms as this rule's forceEvidence.`,
  };
}
