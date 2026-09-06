# Examples

Complete, live-runnable `recourse analyze` / `recourse trace` inputs against **real public
university policy URLs**, with **entirely synthetic student data**.

```bash
cd recourse-grokbot/engine
node src/cli/index.ts analyze examples/uic-grievance.json
node src/cli/index.ts trace   examples/cwru-formal-hearing.json
```

Both fetch their source live, so they need network access to the URL named in the input.

| File | Institution | What it demonstrates |
| --- | --- | --- |
| `uic-grievance.json` | University of Illinois Chicago | Two-sided clocks and the derived "received **or is due**, whichever is earlier" anchor: the student's next-stage deadline resolves to a real date even though no decision was ever received. Includes two `NO_NEW_EVENTS` forecast scenarios, across the institution's deadline and then the student's. |
| `cwru-formal-hearing.json` | Case Western Reserve University | Two independent minimum-lead-time constraints against one observed hearing, both resolving NONCONFORMANT, with the computed earliest-permissible date shown. |

## `traces/`

The Recourse Trace artifacts these inputs produced, in both forms — `.trace.json` (machine-readable,
content-hashed) and `.trace.md` (the record a student could hand to an advisor or ombuds office).

These are committed as illustrations of the artifact's shape. Re-running the commands produces a
trace with a **different `traceHash`**, because each capture records its own `retrievedAt` timestamp
and the hash covers it: a trace is the record of one specific run against one specific fetch, not a
reproducible build output. The source `contentHash` is what stays stable while the document does —
and `recourse drift` is what checks that.

## Data

Every `CaseEvent` in these files is invented. No real student's record appears anywhere in this
repository. The institutional sources are real, public, and unauthenticated.
