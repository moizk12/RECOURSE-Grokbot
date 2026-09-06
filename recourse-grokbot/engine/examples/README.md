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
| `uic-grievance.json` | University of Illinois Chicago | Two-sided clocks and the derived "received **or is due**, whichever is earlier" anchor: the student's next-stage deadline resolves to a real date even though no decision was ever received. Also carries one deliberately fabricated proposal (an "expedited decision within three (3) business days", which is nowhere in the PDF) so a run shows a refusal alongside a result, and two `NO_NEW_EVENTS` forecast scenarios. |
| `cwru-formal-hearing.json` | Case Western Reserve University | Two independent minimum-lead-time constraints against one observed hearing. The notice rule carries the waiver CWRU's own text attaches to it, and the record says nothing about a waiver — so it resolves **UNDETERMINED** with the exception **UNRESOLVED**. The relevant-information rule is a separate provision the waiver does not reach, and resolves **NONCONFORMANT** with the computed earliest-permissible date. |
| `cwru-formal-hearing-waiver-ruled-out.json` | Case Western Reserve University | The identical case, plus one event: the record affirmatively establishes that the respondent was asked to waive notice and declined. The notice rule now resolves **NONCONFORMANT** with the exception **EXCLUDED**. The pair is the clearest demonstration in the repository that absence of a waiver in the record is not evidence that no waiver was given. |

## `traces/`

The Recourse Trace artifacts these inputs produced, in both forms — `.trace.json` (machine-readable,
content-hashed) and `.trace.md` (the record a student could hand to an advisor or ombuds office).

These are committed as illustrations of the artifact's shape.

The `traceHash` is **content-addressed over one captured analysis**: the same captured sources, the
same case record and the same evaluation instant always produce the same hash, and any change to any
of them changes it. It is **not** stable across independent live re-captures — each fetch records its
own `retrievedAt`, and the hash covers that — so re-running these commands produces a trace with a
different `traceHash` even where every finding is identical. A trace is the record of one specific
run against one specific fetch, not a reproducible build output. The source `contentHash` is what
stays stable while the document does, and `recourse drift` is what checks that.

## Data

Every `CaseEvent` in these files is invented. No real student's record appears anywhere in this
repository. The institutional sources are real, public, and unauthenticated.
