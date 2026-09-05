import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { acquireSource } from "../src/warrant/acquireSource.ts";
import { checkWarrant } from "../src/warrant/warrantValidator.ts";
import { SourceStore, hashBytes, hashContent } from "../src/warrant/sourceStore.ts";
import type { SourceArtifact } from "../src/types/warrant.ts";
import { baseCandidate } from "./support/helpers.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Minimal fetch stand-in for tests: no real network call, but exercises the
 * exact same code path in acquireSource.ts (redirect/final-URL capture, raw
 * byte hashing, content-type dispatch) that a live fetch would.
 */
function fakeFetch(response: { ok?: boolean; status?: number; url: string; contentType: string; body: string }): typeof fetch {
  return (async () =>
    ({
      ok: response.ok ?? true,
      status: response.status ?? 200,
      url: response.url,
      headers: { get: (name: string) => (name.toLowerCase() === "content-type" ? response.contentType : null) },
      arrayBuffer: async () => new TextEncoder().encode(response.body).buffer,
    }) as unknown as Response) as unknown as typeof fetch;
}

function candidateWithWarrant(warrantOverrides: Record<string, unknown>) {
  return baseCandidate({ warrant: warrantOverrides } as never);
}

test("acquireSource records the final URL after a redirect, distinct from the requested URL", async () => {
  const artifact = await acquireSource({
    sourceId: "s1",
    requestedUrl: "https://example.edu/redirector?doc=policy",
    fetchImpl: fakeFetch({
      url: "https://example.edu/policies/2026/policy-final.html",
      contentType: "text/html",
      body: "Students must appeal within ten (10) days.",
    }),
  });

  assert.equal(artifact.requestedUrl, "https://example.edu/redirector?doc=policy");
  assert.equal(artifact.finalUrl, "https://example.edu/policies/2026/policy-final.html");
  assert.notEqual(artifact.requestedUrl, artifact.finalUrl);
});

test("acquireSource falls back to the requested URL when the fetch response reports no final URL", async () => {
  const artifact = await acquireSource({
    sourceId: "s1",
    requestedUrl: "https://example.edu/policy",
    fetchImpl: fakeFetch({ url: "", contentType: "text/plain", body: "Students must appeal within ten (10) days." }),
  });
  assert.equal(artifact.finalUrl, "https://example.edu/policy");
});

test("acquireSource records content type, raw byte hash, and canonical text hash independently", async () => {
  const body = "Students must appeal within ten (10) days.";
  const artifact = await acquireSource({
    sourceId: "s1",
    requestedUrl: "https://example.edu/policy",
    fetchImpl: fakeFetch({ url: "https://example.edu/policy", contentType: "text/plain; charset=utf-8", body }),
  });

  assert.equal(artifact.contentType, "text/plain; charset=utf-8");
  assert.equal(artifact.rawBytesHash, hashBytes(new TextEncoder().encode(body)));
  assert.equal(artifact.contentHash, hashContent(body));
  assert.equal(artifact.content, body);
  assert.deepEqual(artifact.extractor, { name: "identity", version: "1" });
});

test("adversarial: raw-hash drift -- a live document that changed since acquisition invalidates a warrant pinned to the old capture", async () => {
  const original = await acquireSource({
    sourceId: "s1",
    requestedUrl: "https://example.edu/policy",
    fetchImpl: fakeFetch({
      url: "https://example.edu/policy",
      contentType: "text/plain",
      body: "Students must appeal within ten (10) days.",
    }),
  });

  const reAcquired = await acquireSource({
    sourceId: "s1",
    requestedUrl: "https://example.edu/policy",
    fetchImpl: fakeFetch({
      url: "https://example.edu/policy",
      contentType: "text/plain",
      body: "Students must appeal within thirty (30) days.",
    }),
  });

  assert.notEqual(original.rawBytesHash, reAcquired.rawBytesHash);
  assert.notEqual(original.contentHash, reAcquired.contentHash);

  const candidate = candidateWithWarrant({
    sourceId: "s1",
    contentHash: original.contentHash,
    span: { start: 0, end: original.content.length },
    quotedText: original.content,
    claimType: "directly_stated",
  });

  const outcome = checkWarrant(candidate, new SourceStore([reAcquired]));
  assert.equal(outcome.status, "rejected");
  if (outcome.status === "rejected") {
    assert.ok(outcome.errors.some((e) => e.field === "warrant.contentHash"));
  }
});

test("adversarial: substituted source content at acquisition time is caught by hash, not silently trusted", async () => {
  // A candidate proposer believes (was told, or previously observed) the
  // document has a particular hash and quote. If whatever now answers the
  // same URL serves different bytes -- a compromised host, a swapped file,
  // a caching proxy gone wrong -- acquireSource still faithfully hashes what
  // it actually received, and checkWarrant must reject the mismatch rather
  // than trust the candidate's belief about what the document says.
  const claimedContent = "Students must appeal within ten (10) days.";
  const claimedHash = hashContent(claimedContent);

  const substituted = await acquireSource({
    sourceId: "s1",
    requestedUrl: "https://example.edu/policy",
    fetchImpl: fakeFetch({
      url: "https://example.edu/policy",
      contentType: "text/plain",
      body: "Nothing in this document resembles the original policy text at all.",
    }),
  });

  const candidate = candidateWithWarrant({
    sourceId: "s1",
    contentHash: claimedHash,
    span: { start: 0, end: claimedContent.length },
    quotedText: claimedContent,
    claimType: "directly_stated",
  });

  const outcome = checkWarrant(candidate, new SourceStore([substituted]));
  assert.equal(outcome.status, "rejected");
  if (outcome.status === "rejected") {
    assert.ok(outcome.errors.some((e) => e.field === "warrant.contentHash"));
  }
});

test("adversarial: extraction drift -- same raw bytes, different extractor/version, invalidates a warrant pinned to the old canonical text", () => {
  // Simulates upgrading the PDF extractor (or its version) without
  // re-warranting: identical rawBytesHash, but a different extractor
  // produced different canonical text, so contentHash differs too.
  const sharedRawHash = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

  const extractedByV1: SourceArtifact = Object.freeze({
    sourceId: "s1",
    requestedUrl: "https://example.edu/policy.pdf",
    finalUrl: "https://example.edu/policy.pdf",
    retrievedAt: "2026-09-01T00:00:00Z",
    contentType: "application/pdf",
    rawBytesHash: sharedRawHash,
    content: "Students must appeal within ten (10) days.",
    contentHash: hashContent("Students must appeal within ten (10) days."),
    extractor: { name: "pdf-parse", version: "2.4.5" },
  });

  const extractedByV2: SourceArtifact = Object.freeze({
    sourceId: "s1",
    requestedUrl: "https://example.edu/policy.pdf",
    finalUrl: "https://example.edu/policy.pdf",
    retrievedAt: "2026-09-01T00:00:00Z",
    contentType: "application/pdf",
    rawBytesHash: sharedRawHash,
    // A hypothetical newer extractor renders spacing/hyphenation differently
    // from the exact same underlying bytes.
    content: "Students must appeal within ten(10)days.",
    contentHash: hashContent("Students must appeal within ten(10)days."),
    extractor: { name: "pdf-parse", version: "3.0.0" },
  });

  assert.equal(extractedByV1.rawBytesHash, extractedByV2.rawBytesHash);
  assert.notEqual(extractedByV1.contentHash, extractedByV2.contentHash);

  const candidate = candidateWithWarrant({
    sourceId: "s1",
    contentHash: extractedByV1.contentHash,
    span: { start: 0, end: extractedByV1.content.length },
    quotedText: extractedByV1.content,
    claimType: "directly_stated",
  });

  const outcome = checkWarrant(candidate, new SourceStore([extractedByV2]));
  assert.equal(outcome.status, "rejected");
  if (outcome.status === "rejected") {
    assert.ok(outcome.errors.some((e) => e.field === "warrant.contentHash"));
  }
});

test("adversarial: a valid-looking quote that was never present in the fetched official UIC document is rejected", () => {
  const fixturePath = path.join(__dirname, "..", "fixtures", "uic-case.json");
  const fixture = JSON.parse(readFileSync(fixturePath, "utf-8"));
  const uicSource: SourceArtifact = fixture.sources[0];
  const store = new SourceStore([uicSource]);

  // Plausible-sounding, correctly formatted, and in the same style as the
  // real deadlines in this document -- but this sentence does not appear
  // anywhere in the actual fetched PDF text.
  const fabricated = "The Grievant's appeal must be submitted, in writing, within thirty (30) days of the Administrative Officer's decision.";
  const start = 14034;
  const candidate = candidateWithWarrant({
    sourceId: uicSource.sourceId,
    contentHash: uicSource.contentHash,
    span: { start, end: start + fabricated.length },
    quotedText: fabricated,
    claimType: "directly_stated",
  });

  const outcome = checkWarrant(candidate, store);
  assert.equal(outcome.status, "rejected");
  if (outcome.status === "rejected") {
    assert.ok(outcome.errors.some((e) => e.field === "warrant.quotedText"));
  }
});

test("the real UIC fixture's two warranted spans do exist verbatim in the fetched official document", () => {
  const fixturePath = path.join(__dirname, "..", "fixtures", "uic-case.json");
  const fixture = JSON.parse(readFileSync(fixturePath, "utf-8"));
  const uicSource: SourceArtifact = fixture.sources[0];
  const store = new SourceStore([uicSource]);

  for (const rule of fixture.candidateRules) {
    const outcome = checkWarrant(rule, store);
    assert.equal(outcome.status, "auto_promotable", `expected ${rule.id} to be auto-promotable`);
  }
});
