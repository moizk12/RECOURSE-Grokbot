import { fileURLToPath } from "node:url";
import type { BenchCase } from "./benchCase.ts";
import { loadPinnedSources } from "./benchCase.ts";
import { analyzeCase, type AnalyzeCaseResult } from "../src/cli/analyzeCase.ts";
import { uicGrievance } from "./cases/uic-grievance.ts";
import { auburnAppealGrounds } from "./cases/auburn-appeal-grounds.ts";
import { cwruHearingNotice } from "./cases/cwru-hearing-notice.ts";
import { umnGuidanceNotBinding } from "./cases/umn-guidance-not-binding.ts";
import { buffaloActorChain } from "./cases/buffalo-actor-chain.ts";

export const BENCH_CASES: ReadonlyArray<BenchCase> = [
  uicGrievance,
  auburnAppealGrounds,
  cwruHearingNotice,
  umnGuidanceNotBinding,
  buffaloActorChain,
];

export interface BenchRow {
  readonly caseId: string;
  readonly institution: string;
  readonly procedure: string;
  readonly expectationId: string;
  readonly semanticFeature: string;
  readonly expected: string;
  readonly actual: string;
  readonly pass: boolean;
  readonly shortcutRisk: string;
  readonly sourceUrls: ReadonlyArray<string>;
}

export interface BenchReport {
  readonly rows: ReadonlyArray<BenchRow>;
  readonly notes: ReadonlyArray<{ readonly caseId: string; readonly note: string }>;
  readonly failures: number;
  readonly total: number;
}

/**
 * Runs every benchmark case against the pinned source artifacts. No network
 * access: sources are supplied pre-captured, so a benchmark failure always
 * means the engine changed, never that a university edited a web page.
 */
export async function runBenchmark(cases: ReadonlyArray<BenchCase> = BENCH_CASES): Promise<BenchReport> {
  const rows: BenchRow[] = [];
  const notes: { caseId: string; note: string }[] = [];

  for (const benchCase of cases) {
    for (const note of benchCase.notes ?? []) notes.push({ caseId: benchCase.id, note });

    const sources = loadPinnedSources(benchCase.sourceIds);
    const runs = benchCase.runs(sources);
    const results = new Map<string, AnalyzeCaseResult>();

    for (const [name, input] of Object.entries(runs)) {
      results.set(name, await analyzeCase(input));
    }

    for (const expectation of benchCase.expectations) {
      const result = results.get(expectation.run);
      const outcome = result
        ? expectation.check(result)
        : { pass: false, actual: `run '${expectation.run}' is not defined for case '${benchCase.id}'` };

      rows.push({
        caseId: benchCase.id,
        institution: benchCase.institution,
        procedure: benchCase.procedure,
        expectationId: expectation.id,
        semanticFeature: expectation.semanticFeature,
        expected: expectation.expected,
        actual: outcome.actual,
        pass: outcome.pass,
        shortcutRisk: expectation.shortcutRisk,
        sourceUrls: benchCase.sourceUrls,
      });
    }
  }

  return { rows, notes, failures: rows.filter((r) => !r.pass).length, total: rows.length };
}

function cell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

/**
 * The report is a matrix, not a score.
 *
 * There is deliberately no accuracy percentage here. These rows are
 * invariants over five hand-encoded procedures, not predictions over a
 * labelled dataset, and dividing passes by total would dress up a design
 * decision as a measurement. What the matrix is for is letting a reader
 * check each claim against the source URL in the same row.
 */
export function renderBenchMarkdown(report: BenchReport): string {
  const out: string[] = [];

  out.push("# RecourseBench");
  out.push("");
  out.push(
    "Five independently structured, current, authoritative public university procedures. Each row states one " +
      "semantic property, the safe behaviour expected of the engine, and what the engine actually did. Sources are " +
      "captured live through the engine's own acquisition path and pinned (`bench/sources/`); all student data is synthetic."
  );
  out.push("");
  out.push(
    `**${report.total} properties checked · ${report.total - report.failures} behaved as expected · ${report.failures} did not.** ` +
      "No accuracy percentage is reported: these are invariants, not a labelled dataset, and a pass ratio over " +
      "hand-encoded cases would not be a defensible metric."
  );
  out.push("");

  const byCase = new Map<string, BenchRow[]>();
  for (const row of report.rows) {
    const list = byCase.get(row.caseId) ?? [];
    list.push(row);
    byCase.set(row.caseId, list);
  }

  for (const [caseId, rows] of byCase) {
    const first = rows[0]!;
    out.push(`## ${first.institution} — ${first.procedure}`);
    out.push("");
    out.push(`Source: ${first.sourceUrls.map((u) => `<${u}>`).join(", ")}`);
    out.push("");
    out.push("| Semantic feature | Expected safe behaviour | Actual | Result |");
    out.push("| --- | --- | --- | --- |");
    for (const row of rows) {
      out.push(
        `| ${cell(row.semanticFeature)} | ${cell(row.expected)} | ${cell(row.actual)} | ${row.pass ? "PASS" : "**FAIL**"} |`
      );
    }
    out.push("");
    out.push("<details><summary>What a model-style shortcut would get wrong here</summary>");
    out.push("");
    for (const row of rows) out.push(`- **${row.semanticFeature}** — ${row.shortcutRisk}`);
    out.push("");
    out.push("</details>");
    out.push("");

    const caseNotes = report.notes.filter((n) => n.caseId === caseId);
    if (caseNotes.length > 0) {
      out.push("**Recorded caveats:**");
      out.push("");
      for (const n of caseNotes) out.push(`- ${n.note}`);
      out.push("");
    }
  }

  return out.join("\n");
}

async function main(argv: ReadonlyArray<string>): Promise<number> {
  const report = await runBenchmark();
  console.log(argv.includes("--json") ? JSON.stringify(report, null, 2) : renderBenchMarkdown(report));
  return report.failures === 0 ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
