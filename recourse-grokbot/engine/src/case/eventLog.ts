import type { CaseEvent, CaseEventType } from "../types/case.ts";

/**
 * Append-only case event log. There is no update() or delete() — the only
 * mutation is append(). Case state is always recomputed from the full event
 * history (case/caseTwin.ts), never patched in place.
 */
export class CaseEventLog {
  private readonly events: CaseEvent[] = [];

  constructor(initial: ReadonlyArray<CaseEvent> = []) {
    this.events.push(...initial);
  }

  append(event: CaseEvent): void {
    this.events.push(Object.freeze({ ...event, detail: Object.freeze({ ...event.detail }) }));
  }

  all(): ReadonlyArray<CaseEvent> {
    return [...this.events].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  }

  firstOfType(type: CaseEventType): CaseEvent | undefined {
    return this.all().find((e) => e.type === type);
  }

  ofType(type: CaseEventType): ReadonlyArray<CaseEvent> {
    return this.all().filter((e) => e.type === type);
  }
}
