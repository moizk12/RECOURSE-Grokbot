import test from "node:test";
import assert from "node:assert/strict";
import { runBenchmark, BENCH_CASES, renderBenchMarkdown } from "../bench/runner.ts";
import { loadPinnedSources } from "../bench/benchCase.ts";

/**
 * RecourseBench as a regression gate.
 *
 * The benchmark is a suite of invariants over five real, pinned university
 * procedures, so it belongs in the test run: a change that quietly breaks
 * business-day arithmetic, the authority gate, or fail-closed conformance
 * should fail here as loudly as it fails a unit test.
 *
 * These assertions are about the SUITE's integrity -- that it still covers
 * five institutions, that its sources are genuinely captured artifacts, and
 * that every property still holds. The per-property expectations live with
 * their cases in bench/cases/.
 */

test("every benchmark property behaves as expected", async () => {
  const report = await runBenchmark();
  const failed = report.rows.filter((r) => !r.pass);
  assert.deepEqual(
    failed.map((r) => `${r.caseId}/${r.expectationId}: ${r.actual}`),
    [],
    "a benchmark property regressed"
  );
  assert.ok(report.total >= 25, `expected a substantive suite, got ${report.total} properties`);
});

test("the suite covers five independently structured institutions", () => {
  assert.equal(BENCH_CASES.length, 5);
  const institutions = new Set(BENCH_CASES.map((c) => c.institution));
  assert.equal(institutions.size, 5, `expected 5 distinct institutions, got ${[...institutions].join(", ")}`);
});

test("every benchmark source is a real captured artifact with both hashes and an extractor", () => {
  for (const benchCase of BENCH_CASES) {
    for (const source of loadPinnedSources(benchCase.sourceIds)) {
      assert.match(source.rawBytesHash, /^sha256:[0-9a-f]{64}$/, `${source.sourceId} rawBytesHash`);
      assert.match(source.contentHash, /^sha256:[0-9a-f]{64}$/, `${source.sourceId} contentHash`);
      assert.ok(source.content.length > 1000, `${source.sourceId} content looks truncated`);
      assert.ok(source.finalUrl.startsWith("https://"), `${source.sourceId} finalUrl`);
      assert.ok(source.extractor.name.length > 0 && source.extractor.version.length > 0, `${source.sourceId} extractor`);
    }
  }
});

test("every benchmark case cites the public source URL its rows are checkable against", () => {
  for (const benchCase of BENCH_CASES) {
    assert.ok(benchCase.sourceUrls.length > 0, `${benchCase.id} declares no source URL`);
    for (const url of benchCase.sourceUrls) {
      assert.ok(url.startsWith("https://"), `${benchCase.id}: ${url}`);
    }
  }
});

test("the report is a matrix and never claims an accuracy percentage", async () => {
  const report = await runBenchmark();
  const md = renderBenchMarkdown(report);
  assert.match(md, /# RecourseBench/);
  assert.match(md, /\| Semantic feature \| Expected safe behaviour \| Actual \| Result \|/);
  assert.match(md, /No accuracy percentage is reported/);
  assert.doesNotMatch(md, /\d+(\.\d+)?%/, "the report must not present a percentage score");
});

test("every property records what a model-style shortcut would get wrong", () => {
  for (const benchCase of BENCH_CASES) {
    for (const expectation of benchCase.expectations) {
      assert.ok(
        expectation.shortcutRisk.trim().length > 20,
        `${benchCase.id}/${expectation.id} has no stated shortcut risk`
      );
    }
  }
});
