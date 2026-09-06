# Recourse Trace — uic-grievance-demo

**Evaluated as of:** 2026-03-10T00:00:00Z
**Case data:** synthetic case data; real, live-acquired institutional source
**Trace hash:** `sha256:b7046bb0941d3733fa56f00e686aa0e071c9400aed5f7185c50e829ba29512af`

## Governing authority

**Decision type:** academic_grievance at University of Illinois Chicago
**Resolution:** APPLICABLE
**Why:** 'uic-academic-grievance' is the only source matching this scope with no unresolved competing claim

**Governing source:** `uic-academic-grievance`
**Supporting sources:** none

## Sources as captured

### `uic-academic-grievance`
- Final URL: https://oae.uic.edu/wp-content/uploads/sites/32/2019/10/UIC_Student_Academic_Grievance_Procedures-and-Forms_FINAL_Sept-2019.pdf
- Retrieved: 2026-09-06T10:10:29.272Z
- Content type: application/pdf
- Raw document hash: `sha256:2ff5a5abbc2553879d3d8201de20a10ae646a114e51eaa09a9f2c132c075477c`
- Canonical text hash: `sha256:3cfacf12cd43bf0d68a4f18b39ab1b82c1492a26c93935b6fc90c7fb99fe2577`
- Extractor: pdf-parse v2.4.5

## What was validated, and what was refused

Validated claims: **2** · Refused: **0** · Held for human review: **0**

### Validated

**`uic-ao-decision`** (policy_rule, directly_stated) — source `uic-academic-grievance`
> The Administrative Officer’s decision must be issued in writing, within ten (10) days following their receipt of the Academic Grievance.

**`uic-student-request-hearing`** (policy_rule, directly_stated) — source `uic-academic-grievance`
> Limitations imposed upon the Grievant for filing appeals of decisions will be calculated from the date that any decision is received by the Grievant, or is due, whichever date is earlier.

### Refused

_None._

### Held for human review

_None._

## The procedure as validated

**Parties:** institution, student

| Obligation | Party | Due | Status |
| --- | --- | --- | --- |
| `uic-student-request-hearing` — MUST request_formal_hearing | student | 2026-03-30 | **pending** |
| `uic-ao-decision` — MUST issue_administrative_officer_decision | institution | 2026-03-16 | **pending** |

- `uic-student-request-hearing`: deadline has not yet passed
  > Limitations imposed upon the Grievant for filing appeals of decisions will be calculated from the date that any decision is received by the Grievant, or is due, whichever date is earlier.
- `uic-ao-decision`: deadline has not yet passed
  > The Administrative Officer’s decision must be issued in writing, within ten (10) days following their receipt of the Academic Grievance.

## What actually happened (append-only case record)

| When | Event | Id |
| --- | --- | --- |
| 2026-03-02T09:00:00Z | case_opened | `uic-e1` |
| 2026-03-02T09:00:00Z | grievance_filed | `uic-e2` |

## Conformance findings

_No conformance rules were validated for this case._

## Forecast

### `through-institution-deadline` — NO_NEW_EVENTS as of 2026-03-18T00:00:00Z

**Result:** NEW_DEVIATION_DETECTED

**Stated assumptions:**

- no party takes any further action; the university does not respond

**What changes under this scenario:**

- obligation `uic-ao-decision`: pending → **missed**

### `through-student-deadline` — NO_NEW_EVENTS as of 2026-04-02T00:00:00Z

**Result:** NEW_DEVIATION_DETECTED

**Stated assumptions:**

- no party takes any further action; the university still has not responded

**What changes under this scenario:**

- obligation `uic-student-request-hearing`: pending → **missed**
- obligation `uic-ao-decision`: pending → **missed**

## What could not be determined

_None._

## Scope of this record

Recourse compares a published institutional procedure against the recorded events of one case. It does not infer a remedy, a legal entitlement, guilt, innocence, or any guaranteed institutional outcome. A finding below states only whether an observed process matches a procedural rule that was validated against quoted text in the governing source; where the record is incomplete, the finding is UNDETERMINED rather than resolved in either party's favour. This is a procedural record, not legal advice.

