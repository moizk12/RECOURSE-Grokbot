# Routine: Policy Drift Watch

**Status: the engine primitive is implemented; this Routine has never been run.** Two different
things, and the distinction matters for what may be claimed:

- `recourse drift` — the deterministic engine primitive. Implemented in `engine/src/drift/`, tested
  in `engine/test/sourceDrift.test.ts`, runnable from the CLI with no model in the loop, and run
  live against the CWRU page during release verification (result: UNCHANGED).
- **This Routine** — the scheduled Grok wrapper around that command, described below. **No scheduled
  run has been performed.** Nothing in this repository is evidence that one has, and nothing in the
  demo, the post, or the Bot description may imply otherwise.

## What this routine is for

A case is validated against institutional documents as they existed at one moment. Those documents
keep changing — a procedure page is edited, a PDF is re-issued, a URL starts redirecting somewhere
else. When that happens, the conclusions in a student's Recourse Trace are no longer resting on the
document they were checked against.

This routine detects that, and does nothing else.

## The engine primitive

The whole routine is a scheduler around one deterministic command. It works with no model in the
loop, and can be run by hand:

```bash
node src/cli/index.ts drift path/to/trace.json
```

It re-acquires each URL the trace pinned, compares raw-bytes and canonical-text hashes against the
versions actually used, and reports one status per source:

| Status | Meaning |
| --- | --- |
| `UNCHANGED` | Same bytes, same canonical text, same extractor. Nothing to report. |

**A `CHANGED` result is not evidence that a rule changed.** Verified during the v1.0.1 release gate
by re-capturing all five RecourseBench sources: two of them (University of Minnesota, University at
Buffalo) produce a different `contentHash` on every fetch, because of a rotating Cloudflare
email-obfuscation token and a CDN cache-buster in an `og:image` URL respectively. Neither page's
policy text moved by a character, and all 32 benchmark properties passed unchanged against the fresh
captures. This is exactly why drift reports a hash difference and demands revalidation rather than
asserting that a requirement changed — inferring semantic change from a hash would be the confident
inference this system refuses to make.
| `SOURCE_CHANGED` | The document served is not the document that was read. |
| `EXTRACTOR_DRIFT` | Byte-identical document, different canonical text — our reading changed, not the document. |
| `SOURCE_UNAVAILABLE` | The URL could not be re-acquired at all. |

Anything other than `UNCHANGED` sets the case-level result to `REVALIDATION_REQUIRED` and lists
exactly which validated claims and findings depended on that source.

## The recurring workflow

1. **Open cases only.** Closed and archived cases are not re-checked.
2. **Re-fetch the pinned sources** for each open case's stored trace, via `recourse drift`.
3. **Stay silent if unchanged.** A routine that reports "still fine" every day trains people to
   ignore it. No output means no drift.
4. **If changed or unavailable, report** the affected case, the affected source, and the specific
   rules and findings that depended on it.
5. **Require revalidation.** The affected conclusions are marked stale. They are not re-derived.
6. **Take no university action.** No forms, no submissions, no messages to any institution.

## What this routine must never do

- **Never promote rules from the new version.** A changed page is not a re-validated page. The drift
  primitive compiles nothing; it has no code path that produces a rule.
- **Never present a stale conclusion as current.** A prior finding is carried explicitly labelled as
  stale, or not carried at all.
- **Never claim the rule changed.** A different hash proves the *document* is not the one that was
  read. Whether the substantive requirement moved is a question for human revalidation. Saying
  otherwise from a hash comparison is precisely the confident inference this system exists to refuse.
- **Never touch authenticated systems.** Public URLs only. No student portal, no SIS, no login, no
  institutional connector.
- **Never act on the student's behalf.** No appeal is filed, no deadline is met, no message is sent.

## Grok's role, and where it stops

Grok can schedule the check, read the reported diff, and explain in plain language what a student
might want to ask about. It does not decide whether a rule changed, does not re-validate anything,
and does not update a case. Revalidation means re-running the analysis against the new source and a
human reviewing the result — the same path any first analysis takes.

## Scope limits

- Public, unauthenticated URLs only.
- No general-purpose crawling: only URLs already pinned in an existing case trace are re-fetched.
- One request per pinned source per scheduled run.
