import { readFileSync } from "node:fs";
import type { RecourseTrace } from "../trace/recourseTrace.ts";
import { checkSourceDrift, renderDriftMarkdown, type CaseDriftReport } from "../drift/sourceDrift.ts";

export interface DriftCaseOutput {
  readonly report: CaseDriftReport;
  readonly markdown: string;
}

/**
 * `recourse drift <trace.json> [--as-of <iso>]` -- re-acquires the sources a
 * stored Recourse Trace was validated against and reports which of that
 * case's conclusions can no longer be presented as current.
 *
 * Callable without any model in the loop; the Grok routine described in
 * routines/policy-drift.md is a scheduler around exactly this command.
 *
 * On `checkedAt` and this codebase's ban on ambient time: the ban exists
 * because a deadline's status must never depend on when someone happened to
 * ask. `checkedAt` is not that -- it records when a network fetch occurred,
 * and no conclusion is derived from it. It is the same honest wall-clock
 * stamp warrant/acquireSource.ts already puts on `retrievedAt`, so the CLI
 * defaults it rather than demanding a flag for a value it would only invent.
 */
export async function driftCaseFile(path: string, checkedAt: string): Promise<DriftCaseOutput> {
  const trace = JSON.parse(readFileSync(path, "utf-8")) as RecourseTrace;
  if (!trace.sources || !trace.case) {
    throw new Error(`${path} does not look like a Recourse Trace (expected 'case' and 'sources' fields)`);
  }
  const report = await checkSourceDrift(trace, { checkedAt });
  return { report, markdown: renderDriftMarkdown(report) };
}
