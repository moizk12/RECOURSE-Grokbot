#!/usr/bin/env node
import { evaluateFixtureFile } from "./evaluate.ts";
import { resolveCaseFile } from "./resolveCase.ts";
import { analyzeCaseFile } from "./analyzeCase.ts";
import { traceCaseFile } from "./traceCase.ts";

const USAGE = [
  "usage:",
  "  recourse evaluate <fixture.json>          pre-captured sources, no authority layer (v0.1)",
  "  recourse resolve  <input.json>            live acquisition -> raw proposals -> case state (v0.1)",
  "  recourse analyze  <input.json>            full chain: authority -> rules -> Case Twin -> conformance -> forecast",
  "  recourse trace    <input.json> [--json]   the same analysis, as a Recourse Trace (Markdown by default)",
].join("\n");

type Command = "evaluate" | "resolve" | "analyze" | "trace";

function isCommand(value: string | undefined): value is Command {
  return value === "evaluate" || value === "resolve" || value === "analyze" || value === "trace";
}

async function run(command: Command, target: string, flags: ReadonlySet<string>): Promise<string> {
  if (command === "trace") {
    const { trace, markdown } = await traceCaseFile(target);
    return flags.has("--json") ? JSON.stringify(trace, null, 2) : markdown;
  }
  const result =
    command === "evaluate"
      ? evaluateFixtureFile(target)
      : command === "resolve"
        ? await resolveCaseFile(target)
        : await analyzeCaseFile(target);
  return JSON.stringify(result, null, 2);
}

async function main(argv: string[]): Promise<number> {
  const [command, target, ...rest] = argv;

  if (!target || !isCommand(command)) {
    console.error(USAGE);
    return 1;
  }

  try {
    console.log(await run(command, target, new Set(rest)));
    return 0;
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    return 1;
  }
}

main(process.argv.slice(2)).then((code) => process.exit(code));
