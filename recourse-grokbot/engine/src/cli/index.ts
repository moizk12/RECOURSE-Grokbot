#!/usr/bin/env node
import { evaluateFixtureFile } from "./evaluate.ts";

function main(argv: string[]): number {
  const [command, target] = argv;

  if (command !== "evaluate" || !target) {
    console.error("usage: recourse evaluate <fixture.json>");
    return 1;
  }

  const result = evaluateFixtureFile(target);
  console.log(JSON.stringify(result, null, 2));
  return 0;
}

process.exit(main(process.argv.slice(2)));
