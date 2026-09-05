import test from "node:test";
import assert from "node:assert/strict";
import { CaseEventLog } from "../src/case/eventLog.ts";

test("CaseEventLog has no update or delete method — only append", () => {
  const log = new CaseEventLog();
  assert.equal((log as unknown as Record<string, unknown>).update, undefined);
  assert.equal((log as unknown as Record<string, unknown>).delete, undefined);
  assert.equal((log as unknown as Record<string, unknown>).remove, undefined);
});

test("appended events are frozen and cannot be mutated in place", () => {
  const log = new CaseEventLog();
  log.append({ eventId: "e1", type: "case_opened", occurredAt: "2026-01-01T00:00:00Z", detail: { note: "x" } });
  const [event] = log.all();
  assert.throws(() => {
    // @ts-expect-error intentional mutation attempt for the test
    event.detail.note = "y";
  });
});

test("all() reflects every appended event in occurredAt order, regardless of append order", () => {
  const log = new CaseEventLog();
  log.append({ eventId: "e2", type: "ground_asserted", occurredAt: "2026-01-05T00:00:00Z", detail: {} });
  log.append({ eventId: "e1", type: "case_opened", occurredAt: "2026-01-01T00:00:00Z", detail: {} });
  const all = log.all();
  assert.deepEqual(all.map((e) => e.eventId), ["e1", "e2"]);
});
