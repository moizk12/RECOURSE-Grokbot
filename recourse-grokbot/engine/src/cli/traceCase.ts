import { readFileSync } from "node:fs";
import { analyzeCase, type AnalyzeCaseInput } from "./analyzeCase.ts";
import { buildRecourseTrace, renderRecourseTraceMarkdown, type RecourseTrace } from "../trace/recourseTrace.ts";

/**
 * `recourse trace <input.json>` -- runs the same analysis `recourse analyze`
 * runs, then emits the reviewable proof artifact for it. Same input file
 * format, so a case can be re-run either way without editing anything.
 */
export interface TraceCaseOutput {
  readonly trace: RecourseTrace;
  readonly markdown: string;
}

export async function traceCaseFile(path: string): Promise<TraceCaseOutput> {
  const input = JSON.parse(readFileSync(path, "utf-8")) as AnalyzeCaseInput;
  const analysis = await analyzeCase(input);
  const trace = buildRecourseTrace(analysis);
  return { trace, markdown: renderRecourseTraceMarkdown(trace) };
}
