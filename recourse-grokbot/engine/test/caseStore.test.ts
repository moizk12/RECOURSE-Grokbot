import test from "node:test";
import assert from "node:assert/strict";
import { appendFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { FileCaseEventStore } from "../src/case/caseStore.ts";
import { computeCaseState } from "../src/case/caseTwin.ts";
import { validateRules } from "../src/validation/ruleValidator.ts";
import { buildProcedureModel } from "../src/procedure/procedureModel.ts";
import { baseCandidate } from "./support/helpers.ts";

function tempLogPath(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "recourse-case-"));
  return path.join(dir, "case-1", "events.log.jsonl");
}

test("append then load reconstructs the exact event sequence from disk", () => {
  const logPath = tempLogPath();
  const store = new FileCaseEventStore(logPath);

  store.append({ eventId: "e1", type: "case_opened", occurredAt: "2026-01-01T00:00:00Z", detail: {} });
  store.append({ eventId: "e2", type: "grievance_filed", occurredAt: "2026-01-02T00:00:00Z", detail: {} });

  const reloaded = store.load();
  assert.deepEqual(
    reloaded.all().map((e) => e.eventId),
    ["e1", "e2"]
  );

  rmSync(path.dirname(logPath), { recursive: true, force: true });
});

test("case state replayed from a durable log matches state computed from an in-memory log with the same events", () => {
  const logPath = tempLogPath();
  const store = new FileCaseEventStore(logPath);
  store.append({ eventId: "e1", type: "grievance_filed", occurredAt: "2026-01-05T00:00:00Z", detail: {} });

  const { validated } = validateRules([
    baseCandidate({
      id: "inst-decide",
      actor: "administrative_officer",
      action: "decide",
      trigger: { eventType: "grievance_filed" },
      deadline: { type: "relative", amount: 10, unit: "business_day", fromEvent: "grievance_filed" },
    }),
  ]);
  const procedure = buildProcedureModel(validated);

  const replayedLog = store.load();
  const state = computeCaseState(procedure, replayedLog, "2026-01-10T00:00:00Z");

  assert.equal(state.obligations[0]?.dueAt, "2026-01-19");

  rmSync(path.dirname(logPath), { recursive: true, force: true });
});

test("loading a store whose file does not exist yet returns an empty log, not an error", () => {
  const logPath = tempLogPath();
  const store = new FileCaseEventStore(logPath);
  const log = store.load();
  assert.deepEqual(log.all(), []);
});

test("the log file only ever grows via appendFileSync — never truncated by append()", () => {
  const logPath = tempLogPath();
  const store = new FileCaseEventStore(logPath);
  store.append({ eventId: "e1", type: "case_opened", occurredAt: "2026-01-01T00:00:00Z", detail: {} });
  const afterFirst = readFileSync(logPath, "utf-8");
  store.append({ eventId: "e2", type: "grievance_filed", occurredAt: "2026-01-02T00:00:00Z", detail: {} });
  const afterSecond = readFileSync(logPath, "utf-8");

  assert.ok(afterSecond.startsWith(afterFirst), "prior content must be preserved, not rewritten");
  assert.ok(afterSecond.length > afterFirst.length);

  rmSync(path.dirname(logPath), { recursive: true, force: true });
});

test("a corrupt trailing line (interrupted append) is dropped, not fatal", () => {
  const logPath = tempLogPath();
  const store = new FileCaseEventStore(logPath);
  store.append({ eventId: "e1", type: "case_opened", occurredAt: "2026-01-01T00:00:00Z", detail: {} });

  appendFileSync(logPath, '{"eventId":"e2","type":"grievance_fi'); // truncated mid-write, no trailing newline

  const log = store.load();
  assert.deepEqual(
    log.all().map((e) => e.eventId),
    ["e1"]
  );

  rmSync(path.dirname(logPath), { recursive: true, force: true });
});

test("a corrupt interior line is a genuine corruption signal and throws rather than silently rewriting history", () => {
  const logPath = tempLogPath();
  const store = new FileCaseEventStore(logPath);
  store.append({ eventId: "e1", type: "case_opened", occurredAt: "2026-01-01T00:00:00Z", detail: {} });

  appendFileSync(logPath, "not json at all\n");
  store.append({ eventId: "e3", type: "grievance_filed", occurredAt: "2026-01-02T00:00:00Z", detail: {} });

  assert.throws(() => store.load());

  rmSync(path.dirname(logPath), { recursive: true, force: true });
});

test("rewriteForCompaction atomically replaces the log contents", () => {
  const logPath = tempLogPath();
  const store = new FileCaseEventStore(logPath);
  store.append({ eventId: "e1", type: "case_opened", occurredAt: "2026-01-01T00:00:00Z", detail: {} });
  store.append({ eventId: "e2", type: "grievance_filed", occurredAt: "2026-01-02T00:00:00Z", detail: {} });

  store.rewriteForCompaction([{ eventId: "e2", type: "grievance_filed", occurredAt: "2026-01-02T00:00:00Z", detail: {} }]);

  const reloaded = store.load();
  assert.deepEqual(
    reloaded.all().map((e) => e.eventId),
    ["e2"]
  );

  rmSync(path.dirname(logPath), { recursive: true, force: true });
});
