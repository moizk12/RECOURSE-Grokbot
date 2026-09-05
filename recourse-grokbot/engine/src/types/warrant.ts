/**
 * Source/warrant layer.
 *
 * This sits in front of validation/provenanceValidator.ts and is the actual
 * trust boundary for untrusted extraction: a CandidatePolicyRule's
 * `provenance.sourceSpan` is a claim written by whoever (or whatever)
 * proposed the rule. A `warrant` is a checkable pointer into a specific,
 * previously captured, content-hashed SourceArtifact. Matching the
 * CandidatePolicyRule schema (provenance present, sourceSpan non-empty)
 * proves nothing about whether that span exists in any real source --
 * warrant/warrantValidator.ts is what actually confirms that, deterministically,
 * against captured content only. No network call and no LLM call happens in
 * that check.
 */

/**
 * "directly_stated": the cited span itself asserts the rule, no interpretive
 * step required. "inferred": the rule is the proposer's reading of the span
 * (e.g. concluding a list is exhaustive from what it doesn't mention). Only
 * "directly_stated" candidates may be auto-promoted -- see warrantValidator.ts.
 */
export type ClaimType = "directly_stated" | "inferred";

/** Which code turned raw fetched bytes into canonical `content`, and which version -- reproducibility metadata. */
export interface ExtractorMetadata {
  readonly name: string;
  readonly version: string;
}

/**
 * A source acquired once, at a specific time, from a specific URL, with both
 * its raw bytes and its extracted canonical text hashed at acquisition. A
 * warrant may only point at an artifact like this -- never at a live URL,
 * never at a proposer's paraphrase, and never at text that didn't come from
 * a hashed, attributable fetch.
 *
 * Two hashes matter for two different reasons: `rawBytesHash` proves what
 * was actually downloaded from `finalUrl` (catches a substituted document or
 * a re-published page); `contentHash` is what warrant spans/offsets are
 * checked against, and changes whenever `rawBytesHash` changes OR the
 * extractor/version changes (same bytes, different extraction). Either
 * change invalidates warrants pinned to the old `contentHash` -- see
 * warrant/warrantValidator.ts.
 */
export interface SourceArtifact {
  readonly sourceId: string;
  /** URL acquisition was asked to fetch. */
  readonly requestedUrl: string;
  /** URL that actually served the content, after following redirects. */
  readonly finalUrl: string;
  /** ISO 8601 timestamp of acquisition. */
  readonly retrievedAt: string;
  /** Content-Type reported for the fetched resource (e.g. "application/pdf"). */
  readonly contentType: string;
  /** "sha256:<hex>" of the raw fetched bytes, before any extraction. */
  readonly rawBytesHash: string;
  /** Canonical extracted text -- what a warrant's span/quotedText is checked against. */
  readonly content: string;
  /** "sha256:<hex>", computed from `content`. */
  readonly contentHash: string;
  /** Which extractor (and version) produced `content` from the raw bytes. */
  readonly extractor: ExtractorMetadata;
}

/**
 * A candidate rule's pointer into a captured SourceArtifact: which source,
 * which exact character span, what the candidate believes that span says
 * verbatim, and whether the rule is directly stated there or merely
 * inferred from it.
 */
export interface EvidenceWarrant {
  readonly sourceId: string;
  /** contentHash the candidate believes the cited source has -- pins against silent source drift between proposal and check. */
  readonly contentHash: string;
  readonly span: { readonly start: number; readonly end: number };
  /** Exact text the candidate claims occupies `span` in the source's content. */
  readonly quotedText: string;
  readonly claimType: ClaimType;
}

export interface WarrantError {
  readonly ruleId: string;
  readonly field: string;
  readonly message: string;
}
