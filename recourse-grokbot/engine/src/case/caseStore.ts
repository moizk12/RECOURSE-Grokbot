import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { CaseEvent } from "../types/case.ts";
import { CaseEventLog } from "./eventLog.ts";

/**
 * Durable, append-only case event persistence, matching ARCHITECTURE.md's
 * `/cases/{case-id}/events.log.jsonl` layout: one JSON-encoded CaseEvent per
 * line. This is the on-disk counterpart of the in-memory CaseEventLog — case
 * state is never persisted directly, only the event log is, and state is
 * always reconstructed by replaying it (see `load()`).
 *
 * There is no update/rewrite path: `append()` only ever calls
 * `fs.appendFileSync`, never `writeFileSync` on an existing file. The one
 * exception is `ensureFile()`, which creates an empty file if none exists yet
 * (a genuinely new case), never truncates an existing one.
 */
export class FileCaseEventStore {
  private readonly path: string;

  constructor(path: string) {
    this.path = path;
  }

  /** Creates the log file (and parent directory) if it does not already exist. Never truncates. */
  ensureFile(): void {
    const dir = dirname(this.path);
    if (dir && !existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    if (!existsSync(this.path)) {
      writeFileSync(this.path, "", { flag: "wx" });
    }
  }

  /** Appends one event as a single JSON line. Durable: never rewrites or truncates existing content. */
  append(event: CaseEvent): void {
    this.ensureFile();
    appendFileSync(this.path, JSON.stringify(event) + "\n", "utf-8");
  }

  appendAll(events: ReadonlyArray<CaseEvent>): void {
    for (const event of events) this.append(event);
  }

  /**
   * Replays the full on-disk log into a fresh CaseEventLog. This is the only
   * way case state is reconstructed after a restart — there is no cached
   * "latest state" file to fall back on, so replay correctness is what makes
   * the store trustworthy after a crash or process restart.
   *
   * A trailing partial line (e.g. from a write interrupted mid-append) is
   * skipped rather than causing the whole replay to fail closed on an
   * otherwise-valid log — but any non-trailing malformed line is a genuine
   * corruption signal and throws, since silently dropping an interior event
   * would silently rewrite case history.
   */
  load(): CaseEventLog {
    if (!existsSync(this.path)) {
      return new CaseEventLog();
    }
    const raw = readFileSync(this.path, "utf-8");
    const lines = raw.split("\n").filter((line) => line.length > 0);
    const events: CaseEvent[] = [];

    lines.forEach((line, i) => {
      try {
        events.push(JSON.parse(line) as CaseEvent);
      } catch (cause) {
        const isTrailingLine = i === lines.length - 1;
        if (isTrailingLine) return; // likely an interrupted final append; drop it, don't fabricate a repair
        throw new Error(`corrupt case event log at ${this.path}, line ${i + 1}: ${String(cause)}`);
      }
    });

    return new CaseEventLog(events);
  }

  /**
   * Atomically rewrites the log to contain exactly `events`, in order. This
   * is NOT used by normal case progression (which only ever appends) — it
   * exists solely for deliberate, explicit compaction/migration tooling, and
   * writes to a temp file then renames over the original so a crash mid-write
   * never leaves a truncated log in place.
   */
  rewriteForCompaction(events: ReadonlyArray<CaseEvent>): void {
    this.ensureFile();
    const tmpPath = `${this.path}.tmp-${process.pid}-${Date.now()}`;
    const content = events.map((e) => JSON.stringify(e)).join("\n") + (events.length > 0 ? "\n" : "");
    writeFileSync(tmpPath, content, "utf-8");
    renameSync(tmpPath, this.path);
  }
}
