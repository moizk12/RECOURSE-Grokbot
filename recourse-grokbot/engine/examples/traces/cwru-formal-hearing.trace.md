# Recourse Trace — cwru-formal-hearing-demo

**Evaluated as of:** 2026-03-24T00:00:00Z
**Case data:** synthetic case data; real, live-acquired institutional source
**Trace hash:** `sha256:122d639ba713496567ea6cf723c44e67b1777cfb156e28140bd103e30ced9179`

## Governing authority

**Decision type:** student_conduct_formal_hearing at Case Western Reserve University
**Resolution:** APPLICABLE
**Why:** 'cwru-formal-hearing' is the only source matching this scope with no unresolved competing claim

**Governing source:** `cwru-formal-hearing`
**Supporting sources:** none

## Sources as captured

### `cwru-formal-hearing`
- Final URL: https://case.edu/studentlife/conduct/university-code-conduct/procedures/formal-hearing-process
- Retrieved: 2026-09-06T10:10:30.565Z
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

_No binding obligations were validated._

## What actually happened (append-only case record)

| When | Event | Id |
| --- | --- | --- |
| 2026-03-16T09:00:00Z | case_opened | `cw-e1` |
| 2026-03-20T09:00:00Z | hearing_notice_sent | `cw-e2` |
| 2026-03-20T14:00:00Z | relevant_information_disclosed | `cw-e3` |
| 2026-03-23T09:00:00Z | hearing_held | `cw-e4` |

## Conformance findings

### `cwru-hearing-notice-lead-time` — **NONCONFORMANT**

- **Responsible party:** institution
- **Expected:** at least 5 business_day(s) must elapse between "hearing_notice_sent" and "hearing_held"
- **Observed:** hearing_notice_sent at 2026-03-20T09:00:00Z; hearing_held at 2026-03-23T09:00:00Z
- **Determination:** "hearing_held" occurred at 2026-03-23T09:00:00Z, before the minimum 5 business_day(s) from "hearing_notice_sent" (2026-03-20T09:00:00Z) had elapsed (required on or after 2026-03-27)
- **Rule warrant** (source `cwru-formal-hearing`):
  > The hearing date, time and location will be communicated to the respondents at least five business days prior to the hearing.

### `cwru-information-lead-time` — **NONCONFORMANT**

- **Responsible party:** institution
- **Expected:** at least 5 business_day(s) must elapse between "relevant_information_disclosed" and "hearing_held"
- **Observed:** relevant_information_disclosed at 2026-03-20T14:00:00Z; hearing_held at 2026-03-23T09:00:00Z
- **Determination:** "hearing_held" occurred at 2026-03-23T09:00:00Z, before the minimum 5 business_day(s) from "relevant_information_disclosed" (2026-03-20T14:00:00Z) had elapsed (required on or after 2026-03-27)
- **Rule warrant** (source `cwru-formal-hearing`):
  > Information will be available at least five business days prior to the hearing.

## Forecast

_No forecast scenarios were requested._

## What could not be determined

_None._

## Scope of this record

Recourse compares a published institutional procedure against the recorded events of one case. It does not infer a remedy, a legal entitlement, guilt, innocence, or any guaranteed institutional outcome. A finding below states only whether an observed process matches a procedural rule that was validated against quoted text in the governing source; where the record is incomplete, the finding is UNDETERMINED rather than resolved in either party's favour. This is a procedural record, not legal advice.

