#!/usr/bin/env node
import { evaluateFixtureFile } from "./evaluate.ts";
import { resolveCaseFile } from "./resolveCase.ts";

const USAGE = "usage: recourse evaluate <fixture.json> | recourse resolve <input.json>";

async function main(argv: string[]): Promise<number> {
  const [command, target] = argv;

  if (!target || (command !== "evaluate" && command !== "resolve")) {
    console.error(USAGE);
    return 1;
  }

  try {
    const result = command === "evaluate" ? evaluateFixtureFile(target) : await resolveCaseFile(target);
    console.log(JSON.stringify(result, null, 2));
    return 0;
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    return 1;
  }
}

main(process.argv.slice(2)).then((code) => process.exit(code));
