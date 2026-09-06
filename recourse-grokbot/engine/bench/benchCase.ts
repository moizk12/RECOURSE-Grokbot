import { readFileSync } from "node:fs";
import type { SourceArtifact } from "../src/types/warrant.ts";
import type { AnalyzeCaseInput, AnalyzeCaseResult } from "../src/cli/analyzeCase.ts";
import { sourcePath } from "./capture.ts";

/**
 * RecourseBench.
 *
 * Five independently structured, current, authoritative public university
 * procedures, each chosen because it stresses a DIFFERENT semantic failure
 * mode -- not because five is impressive. The point of the suite is that
 * each case would be got wrong by a plausible model-style shortcut, and that
 * the engine's refusal is deterministic rather than a matter of prompting.
 *
 * Rules the suite holds itself to:
 *
 * - Real sources. Every quote is checked against a SourceArtifact captured
 *   from the live URL through the engine's own acquireSource(), hashed at
 *   acquisition. bench/capture.ts pins them; nothing is transcribed by hand.
 * - Synthetic students only. Every CaseEvent below is invented for the
 *   benchmark. No real student's record appears anywhere in this repository.
 * - Expected SAFE behaviour, not expected output. Several cases pass by
 *   REFUSING to conclude; a case that produced a confident answer where the
 *   source does not support one is a failure, not a success.
 * - No accuracy percentage. These are invariants, not a labelled dataset,
 *   and a pass count is not a scientific metric. The report is a matrix.
 */
export interface BenchExpectation {
  readonly id: string;
  /** Which named run under this case the expectation applies to. */
  readonly run: string;
  /** The exact property under test. */
  readonly semanticFeature: string;
  /** The expected safe behaviour, in reviewable prose. */
  readonly expected: string;
  /** Why a plausible model-style shortcut would get this wrong. */
  readonly shortcutRisk: string;
  readonly check: (result: AnalyzeCaseResult) => { readonly pass: boolean; readonly actual: string };
}

export interface BenchCase {
  readonly id: string;
  readonly institution: string;
  readonly procedure: string;
  readonly sourceIds: ReadonlyArray<string>;
  /** Recorded in the report so every row is traceable to a URL a reader can open. */
  readonly sourceUrls: ReadonlyArray<string>;
  /** Honest caveats about the source or the encoding. Printed in the report. */
  readonly notes?: ReadonlyArray<string>;
  readonly runs: (sources: ReadonlyArray<SourceArtifact>) => Record<string, AnalyzeCaseInput>;
  readonly expectations: ReadonlyArray<BenchExpectation>;
}

/** Loads the pinned SourceArtifacts a case declares. Throws if a source has not been captured. */
export function loadPinnedSources(sourceIds: ReadonlyArray<string>): SourceArtifact[] {
  return sourceIds.map((id) => {
    const path = sourcePath(id);
    try {
      return JSON.parse(readFileSync(path, "utf-8")) as SourceArtifact;
    } catch (cause) {
      throw new Error(`benchmark source '${id}' is not pinned at ${path}; run: node bench/capture.ts ${id} (${String(cause)})`);
    }
  });
}

export function pass(actual: string): { pass: boolean; actual: string } {
  return { pass: true, actual };
}

export function fail(actual: string): { pass: boolean; actual: string } {
  return { pass: false, actual };
}

export function expectTrue(condition: boolean, actual: string): { pass: boolean; actual: string } {
  return { pass: condition, actual };
}
