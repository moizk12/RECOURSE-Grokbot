import { createHash } from "node:crypto";
import type { SourceArtifact } from "../types/warrant.ts";

export function hashContent(content: string): string {
  return `sha256:${createHash("sha256").update(content, "utf8").digest("hex")}`;
}

export function hashBytes(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

/**
 * Captures a source artifact from text supplied directly (not fetched) --
 * e.g. a test fixture, or a source pasted by a human. Honest about what it
 * is: `rawBytesHash` is the hash of `content`'s own UTF-8 bytes (there is no
 * separate raw document here) and `extractor` is the identity extractor, not
 * a claim that any parsing happened. For acquiring a real source (a live URL,
 * a PDF) use acquireSource() in ./acquireSource.ts instead -- that is the
 * only path that actually proves content came from a fetched, hashed
 * document rather than being handed in already-trusted.
 */
export function captureSource(params: {
  sourceId: string;
  requestedUrl: string;
  finalUrl?: string;
  retrievedAt: string;
  contentType?: string;
  content: string;
}): SourceArtifact {
  const rawBytes = Buffer.from(params.content, "utf-8");
  return Object.freeze({
    sourceId: params.sourceId,
    requestedUrl: params.requestedUrl,
    finalUrl: params.finalUrl ?? params.requestedUrl,
    retrievedAt: params.retrievedAt,
    contentType: params.contentType ?? "text/plain",
    rawBytesHash: hashBytes(rawBytes),
    content: params.content,
    contentHash: hashContent(params.content),
    extractor: { name: "identity", version: "1" },
  });
}

/** Registry of captured sources, keyed by sourceId. */
export class SourceStore {
  private readonly bySourceId = new Map<string, SourceArtifact>();

  constructor(sources: SourceArtifact[] = []) {
    for (const s of sources) {
      this.bySourceId.set(s.sourceId, s);
    }
  }

  add(source: SourceArtifact): void {
    this.bySourceId.set(source.sourceId, source);
  }

  get(sourceId: string): SourceArtifact | undefined {
    return this.bySourceId.get(sourceId);
  }
}
