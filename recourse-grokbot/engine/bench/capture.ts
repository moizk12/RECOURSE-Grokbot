/**
 * Pins the benchmark's source artifacts.
 *
 * RecourseBench runs offline against SourceArtifacts captured HERE, through
 * the engine's own acquireSource() -- the same code path a live case uses,
 * with the same hashing and the same versioned extractor. Nothing about the
 * captured content is hand-edited: what the runner checks quotes against is
 * exactly what the fetch returned.
 *
 * Pinning is deliberate, not a convenience. A benchmark that re-fetched five
 * live university websites on every run would be non-deterministic, would
 * fail for reasons unrelated to the engine, and would make a regression
 * indistinguishable from a site outage. Re-run this script to re-pin, and
 * `recourse drift` (src/drift) to detect that a pinned source has since
 * changed.
 *
 *   node bench/capture.ts            re-acquire every source
 *   node bench/capture.ts <id> ...   re-acquire only the named sources
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { acquireSource } from "../src/warrant/acquireSource.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCES_DIR = join(HERE, "sources");

export interface BenchSourceSpec {
  readonly sourceId: string;
  readonly institution: string;
  readonly title: string;
  readonly requestedUrl: string;
}

export const BENCH_SOURCES: ReadonlyArray<BenchSourceSpec> = [
  {
    sourceId: "uic-academic-grievance",
    institution: "University of Illinois Chicago",
    title: "Student Academic Grievance Procedures",
    requestedUrl:
      "https://oae.uic.edu/wp-content/uploads/sites/32/2019/10/UIC_Student_Academic_Grievance_Procedures-and-Forms_FINAL_Sept-2019.pdf",
  },
  {
    sourceId: "auburn-academic-integrity",
    institution: "Auburn University",
    title: "Academic Integrity Policy",
    requestedUrl:
      "https://www.auburn.edu/academic/provost/academic-integrity/_assets/pdf/Academic-Integrity-Policy-FINAL-SP2026.pdf",
  },
  {
    sourceId: "cwru-formal-hearing",
    institution: "Case Western Reserve University",
    title: "Formal Hearing Process",
    requestedUrl: "https://case.edu/studentlife/conduct/university-code-conduct/procedures/formal-hearing-process",
  },
  {
    sourceId: "umn-complaint-guidelines",
    institution: "University of Minnesota",
    title: "Guidelines for Colleges: Hearings Under the Conflict Resolution Process for Student Academic Complaints",
    requestedUrl: "https://policy.umn.edu/education/studentcomplaints-appa",
  },
  {
    sourceId: "buffalo-academic-integrity",
    institution: "University at Buffalo",
    title: "Undergraduate Academic Integrity Procedures",
    requestedUrl: "https://www.buffalo.edu/academic-integrity/policies/ug-academic-integrity-procedures.html",
  },
];

export function sourcePath(sourceId: string): string {
  return join(SOURCES_DIR, `${sourceId}.json`);
}

async function main(only: ReadonlyArray<string>): Promise<number> {
  mkdirSync(SOURCES_DIR, { recursive: true });
  const targets = only.length > 0 ? BENCH_SOURCES.filter((s) => only.includes(s.sourceId)) : BENCH_SOURCES;
  let failures = 0;

  for (const spec of targets) {
    try {
      const artifact = await acquireSource({ sourceId: spec.sourceId, requestedUrl: spec.requestedUrl });
      writeFileSync(sourcePath(spec.sourceId), JSON.stringify(artifact, null, 2), "utf-8");
      console.log(
        `captured ${spec.sourceId}: ${artifact.contentType}, ${artifact.content.length} chars, ${artifact.contentHash}`
      );
    } catch (e) {
      failures += 1;
      console.error(`FAILED ${spec.sourceId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return failures === 0 ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
