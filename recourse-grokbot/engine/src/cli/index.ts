#!/usr/bin/env node
import { evaluateFixtureFile } from "./evaluate.ts";
import { resolveCaseFile } from "./resolveCase.ts";
import { analyzeCaseFile } from "./analyzeCase.ts";

const USAGE = [
  "usage:",
  "  recourse evaluate <fixture.json>   pre-captured sources, no authority layer (v0.1)",
  "  recourse resolve  <input.json>     live acquisition -> raw proposals -> case state (v0.1)",
  "  recourse analyze  <input.json>     full chain: authority -> rules -> Case Twin -> conformance",
].join("\n");

type Command = "evaluate" | "resolve" | "analyze";

const COMMANDS: Record<Command, (target: string) => unknown | Promise<unknown>> = {
  evaluate: evaluateFixtureFile,
  resolve: resolveCaseFile,
  analyze: analyzeCaseFile,
};

function isCommand(value: string | undefined): value is Command {
  return value === "evaluate" || value === "resolve" || value === "analyze";
}

async function main(argv: string[]): Promise<number> {
  const [command, target] = argv;

  if (!target || !isCommand(command)) {
    console.error(USAGE);
    return 1;
  }

  try {
    const result = await COMMANDS[command](target);
    console.log(JSON.stringify(result, null, 2));
    return 0;
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    return 1;
  }
}

main(process.argv.slice(2)).then((code) => process.exit(code));
