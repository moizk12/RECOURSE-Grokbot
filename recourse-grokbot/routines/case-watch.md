# Routine: case-watch

**Type:** scheduled (Grok Bot Routine), not event-triggered — deadlines and policy drift both need to be caught even when nothing external pings the Bot.

**Cadence:** daily, by default. Rationale: the shortest real student-side deadlines observed in research are measured in single-digit business days (e.g., a portal-window appeal open ~25 hours end-to-end, per `benchmarks/case-03-student-deadline.md`) — a weekly sweep could miss an entire window. Daily is cheap (filesystem scan + conditional re-fetch) and keeps within Grok Bot's per-Bot Routine budget (this project uses exactly one Routine, well under the documented 50-per-Bot ceiling).

**Invokes:** `skills/check-case.md`, once per open case, per run.

---

## Behavior

1. List every directory under `/cases/` whose `case.json.state` is not `CLOSED`.
2. For each: invoke `check-case` with no student input (the "Routine sweep" branch of `check-case` Step 2). This performs, at minimum:
   - Source re-verification (drift/staleness check).
   - Obligation-clock recomputation for both parties.
   - State transition into `INSTITUTION_TIMEOUT`, `BLOCKED_STALE_POLICY`, or `ESCALATION_AVAILABLE` if warranted.
3. Append a one-line summary per case to `/log/routine-runs.jsonl`: `{run_at, case_id, prior_state, new_state, drift_detected, deadlines_changed}`.
4. If any case's state *changed* this run (not just "still current"), that's a signal the student should be notified — proactively, without waiting for them to ask. If no case changed, this run produces no student-facing output at all; a routine that pings the student "still nothing new" on every run trains them to ignore it, which defeats the purpose of persistent monitoring.

## What this Routine explicitly does NOT do

- It does not fetch or touch anything beyond the specific `policy.url` values already pinned to open cases, plus (when relevant) the institution's closure-calendar URL for business-day math. It does not go looking for new policies, new institutions, or anything the student hasn't already opened a case about.
- It does not take any action beyond updating case state and, when something changed, drafting a notification for the student to see. It never submits, escalates, or replies on the student's behalf even when `ESCALATION_AVAILABLE` — that election is always the student's, made explicitly, per `SAFETY.md` §8.
- It does not silently "fix" a `BLOCKED_SOURCE_CONFLICT` or `BLOCKED_SOURCE_UNAVAILABLE` case on its own initiative. It retries the fetch (source-unavailable case) but does not attempt to resolve a conflict that already required human judgment once — that judgment isn't re-litigated automatically just because time passed.

## Failure handling within the Routine itself

If `check-case` errors on a given case (e.g., the pinned policy file is missing from disk, violating the append-only contract it should never violate), the Routine logs the error for that case specifically and **continues to the next case** rather than aborting the whole sweep — one corrupted case file should not blind the Bot to every other student's live deadline.

## Retention

Per Grok Bot's own Routine-run retention (20 most recent runs kept natively), `case-watch`'s own run history is short-lived at the platform level; the per-case detail behind each run is preserved indefinitely in `/log/routine-runs.jsonl` and each case's own `events.log.jsonl`, since that's the record that actually matters for a case that might run for months across multiple escalation levels.
