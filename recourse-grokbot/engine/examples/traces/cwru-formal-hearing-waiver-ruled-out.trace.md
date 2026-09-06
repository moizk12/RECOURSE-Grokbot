# Recourse Trace — cwru-formal-hearing-waiver-ruled-out-demo

_A procedural record: what the institution's published procedure requires, what this case's record shows happened, and whether the two match._

## Governing procedure

- **Decision type:** student_conduct_formal_hearing at Case Western Reserve University
- **Governing document:** https://case.edu/studentlife/conduct/university-code-conduct/procedures/formal-hearing-process
- **Retrieved:** 2026-09-06T14:25:10.309Z
- **Applicability:** APPLICABLE — 'cwru-formal-hearing' is the only source matching this scope with no unresolved competing claim
- **Case evaluated as of:** 2026-03-24T00:00:00Z
- **Case data:** synthetic case data (the record affirmatively rules the notice waiver out); real, live-acquired institutional source

## Findings

**2 NONCONFORMANT** — each one below, with the source text it rests on.

### NONCONFORMANT — at least 5 business_day(s) must elapse between "hearing_notice_sent" and "hearing_held"

- **Finding:** **NONCONFORMANT** (the requirement was not met)
- **Responsible party:** institution
- **What the procedure required:** at least 5 business_day(s) must elapse between "hearing_notice_sent" and "hearing_held"
- **What actually happened:** hearing_notice_sent at 2026-03-20T09:00:00Z; hearing_held at 2026-03-23T09:00:00Z
- **Exception stated by the procedure:** the respondent may waive the five-business-day notice period to expedite resolution — **EXCLUDED** (ruled out by the record); ruled out by observed event "hearing_notice_waiver_declined" at 2026-03-20T11:00:00Z
- **How that was determined:** "hearing_held" occurred at 2026-03-23T09:00:00Z, before the minimum 5 business_day(s) from "hearing_notice_sent" (2026-03-20T09:00:00Z) had elapsed (required on or after 2026-03-27) The exception stated in the governing source is ruled out: "hearing_notice_waiver_declined" was recorded at 2026-03-20T11:00:00Z.
- **The procedure's own words** (https://case.edu/studentlife/conduct/university-code-conduct/procedures/formal-hearing-process):
  > The hearing date, time and location will be communicated to the respondents at least five business days prior to the hearing.
- **The exception's own words:**
  > A respondent may choose to waive this notice in the interests of expediting resolution of the case.

### NONCONFORMANT — at least 5 business_day(s) must elapse between "relevant_information_disclosed" and "hearing_held"

- **Finding:** **NONCONFORMANT** (the requirement was not met)
- **Responsible party:** institution
- **What the procedure required:** at least 5 business_day(s) must elapse between "relevant_information_disclosed" and "hearing_held"
- **What actually happened:** relevant_information_disclosed at 2026-03-20T14:00:00Z; hearing_held at 2026-03-23T09:00:00Z
- **How that was determined:** "hearing_held" occurred at 2026-03-23T09:00:00Z, before the minimum 5 business_day(s) from "relevant_information_disclosed" (2026-03-20T14:00:00Z) had elapsed (required on or after 2026-03-27)
- **The procedure's own words** (https://case.edu/studentlife/conduct/university-code-conduct/procedures/formal-hearing-process):
  > Information will be available at least five business days prior to the hearing.

## Deadlines, on both sides

_No binding deadline was compiled for this case._

## What Recourse could not determine

_Nothing was left undetermined in this analysis._

## What this record does not claim

**No remedy or outcome is inferred here.** A finding in this record says only whether the recorded process matches the published procedure. It does not establish that a decision was wrong, that any remedy is owed, what an institution will decide, or any legal entitlement. Recourse does not write appeals, does not file anything, and is not legal advice.

Recourse compares a published institutional procedure against the recorded events of one case. It does not infer a remedy, a legal entitlement, guilt, innocence, or any guaranteed institutional outcome. A finding in this record states only whether an observed process matches a procedural rule that was validated against quoted text in the governing source; where the record is incomplete, the finding is UNDETERMINED rather than resolved in either party's favour. This is a procedural record, not legal advice.

---

# Evidence and working

_Everything the summary above rests on: which documents were fetched and what they hashed to, which claims were accepted, which were refused and why, and the case's full event record. A reader who wants to check the finding rather than read it starts here._

## Governing authority, in full

**Resolution:** APPLICABLE
**Why:** 'cwru-formal-hearing' is the only source matching this scope with no unresolved competing claim

**Governing source:** `cwru-formal-hearing`
**Supporting sources:** none

## Sources as captured

### `cwru-formal-hearing`
- Final URL: https://case.edu/studentlife/conduct/university-code-conduct/procedures/formal-hearing-process
- Retrieved: 2026-09-06T14:25:10.309Z
- Content type: text/html; charset=UTF-8
- Raw document hash: `sha256:e3585e74231d785333800735564e4f7283cf93d0dab1323da427d6cabfe2a73c`
- Canonical text hash: `sha256:e3585e74231d785333800735564e4f7283cf93d0dab1323da427d6cabfe2a73c`
- Extractor: identity v1

## What was validated, and what was refused

Validated claims: **2** · Refused: **0** · Held for human review: **0**

### Validated

**`cwru-hearing-notice-lead-time`** (conformance_rule, directly_stated) — source `cwru-formal-hearing`
> The hearing date, time and location will be communicated to the respondents at least five business days prior to the hearing.

**`cwru-information-lead-time`** (conformance_rule, directly_stated) — source `cwru-formal-hearing`
> Information will be available at least five business days prior to the hearing.

### Refused

_None._

### Held for human review

_None._

## The procedure as validated

**Parties:** institution

## The case record (append-only)

| When | Event | Id |
| --- | --- | --- |
| 2026-03-16T09:00:00Z | case_opened | `cw-e1` |
| 2026-03-20T09:00:00Z | hearing_notice_sent | `cw-e2` |
| 2026-03-20T11:00:00Z | hearing_notice_waiver_declined | `cw-e5` |
| 2026-03-20T14:00:00Z | relevant_information_disclosed | `cw-e3` |
| 2026-03-23T09:00:00Z | hearing_held | `cw-e4` |

## Findings — full computation and warrants

### `cwru-hearing-notice-lead-time` — **NONCONFORMANT**

- **Responsible party:** institution
- **Expected:** at least 5 business_day(s) must elapse between "hearing_notice_sent" and "hearing_held"
- **Observed:** hearing_notice_sent at 2026-03-20T09:00:00Z (`cw-e2`); hearing_held at 2026-03-23T09:00:00Z (`cw-e4`)
- **Determination:** "hearing_held" occurred at 2026-03-23T09:00:00Z, before the minimum 5 business_day(s) from "hearing_notice_sent" (2026-03-20T09:00:00Z) had elapsed (required on or after 2026-03-27) The exception stated in the governing source is ruled out: "hearing_notice_waiver_declined" was recorded at 2026-03-20T11:00:00Z.
- **Exception `cwru-notice-waiver`:** EXCLUDED — ruled out by observed event "hearing_notice_waiver_declined" at 2026-03-20T11:00:00Z
  > A respondent may choose to waive this notice in the interests of expediting resolution of the case.
- **Rule warrant** (source `cwru-formal-hearing`, content hash `sha256:e3585e74231d785333800735564e4f7283cf93d0dab1323da427d6cabfe2a73c`):
  > The hearing date, time and location will be communicated to the respondents at least five business days prior to the hearing.

### `cwru-information-lead-time` — **NONCONFORMANT**

- **Responsible party:** institution
- **Expected:** at least 5 business_day(s) must elapse between "relevant_information_disclosed" and "hearing_held"
- **Observed:** relevant_information_disclosed at 2026-03-20T14:00:00Z (`cw-e3`); hearing_held at 2026-03-23T09:00:00Z (`cw-e4`)
- **Determination:** "hearing_held" occurred at 2026-03-23T09:00:00Z, before the minimum 5 business_day(s) from "relevant_information_disclosed" (2026-03-20T14:00:00Z) had elapsed (required on or after 2026-03-27)
- **Rule warrant** (source `cwru-formal-hearing`, content hash `sha256:e3585e74231d785333800735564e4f7283cf93d0dab1323da427d6cabfe2a73c`):
  > Information will be available at least five business days prior to the hearing.

## Obligations — full detail

_No binding obligations were validated._

## Forecast

_No forecast scenarios were requested._

## Trace integrity

- **Trace version:** 2
- **Trace hash:** `sha256:c2d9dbaa368828c1e1b3a500d9c044b7e4c712719d0d494c218867d80ca5b63c`

The trace hash is content-addressed over this captured analysis: the same captured sources, the same case record and the same evaluation instant always produce this hash. It is not a fingerprint of the live web pages — a fresh run that re-fetches those URLs records new retrieval metadata, so its hash will differ even where every finding is identical. Use `recourse drift` to compare a pinned trace against the live sources.

