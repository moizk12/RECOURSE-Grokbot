import { PDFParse } from "pdf-parse";
import type { ExtractorMetadata, SourceArtifact } from "../types/warrant.ts";
import { hashBytes, hashContent } from "./sourceStore.ts";

/**
 * Version of the pdf-parse library used for PDF extraction, recorded on
 * every acquired SourceArtifact as extraction metadata. package.json pins
 * pdf-parse to this exact version (no `^` range) specifically so this
 * constant, the installed code, and any artifact's `extractor.version` field
 * always agree -- extraction must be reproducible from a known extractor
 * version, not "whatever satisfied the range at install time."
 */
const PDF_PARSE_VERSION = "2.4.5";

export interface AcquireSourceOptions {
  readonly sourceId: string;
  readonly requestedUrl: string;
  /** Injectable for tests -- must never be used to skip hashing/extraction, only to avoid a real network call. */
  readonly fetchImpl?: typeof fetch;
}

/**
 * The only function in this codebase allowed to produce a SourceArtifact
 * from a live URL. It fetches raw bytes (following redirects and recording
 * the final URL actually served), hashes those raw bytes before touching
 * them further, extracts canonical text with a versioned extractor, and
 * hashes that canonical text. This is what closes the trust boundary that
 * warrant/sourceStore.ts#captureSource cannot: a warrant checked against an
 * artifact from here is checked against something proven to have come from
 * `finalUrl`, not merely against text someone (or something) supplied.
 */
export async function acquireSource(opts: AcquireSourceOptions): Promise<SourceArtifact> {
  const doFetch = opts.fetchImpl ?? fetch;
  const response = await doFetch(opts.requestedUrl, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(`source acquisition failed for ${opts.requestedUrl}: HTTP ${response.status}`);
  }

  const finalUrl = response.url && response.url.length > 0 ? response.url : opts.requestedUrl;
  const contentType = response.headers.get("content-type") ?? "application/octet-stream";
  const rawBytes = new Uint8Array(await response.arrayBuffer());
  const rawBytesHash = hashBytes(rawBytes);
  const retrievedAt = new Date().toISOString();

  const { text, extractor } = await extractCanonicalText(rawBytes, contentType);

  return Object.freeze({
    sourceId: opts.sourceId,
    requestedUrl: opts.requestedUrl,
    finalUrl,
    retrievedAt,
    contentType,
    rawBytesHash,
    content: text,
    contentHash: hashContent(text),
    extractor,
  });
}

async function extractCanonicalText(
  rawBytes: Uint8Array,
  contentType: string
): Promise<{ text: string; extractor: ExtractorMetadata }> {
  if (contentType.toLowerCase().includes("pdf")) {
    const parser = new PDFParse({ data: rawBytes });
    try {
      const result = await parser.getText();
      return { text: result.text, extractor: { name: "pdf-parse", version: PDF_PARSE_VERSION } };
    } finally {
      await parser.destroy();
    }
  }
  return { text: Buffer.from(rawBytes).toString("utf-8"), extractor: { name: "identity", version: "1" } };
}
