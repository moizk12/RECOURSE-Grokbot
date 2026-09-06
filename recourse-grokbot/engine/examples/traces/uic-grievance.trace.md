# Recourse Trace — uic-grievance-demo

_A procedural record: what the institution's published procedure requires, what this case's record shows happened, and whether the two match._

## Governing procedure

- **Decision type:** academic_grievance at University of Illinois Chicago
- **Governing document:** https://oae.uic.edu/wp-content/uploads/sites/32/2019/10/UIC_Student_Academic_Grievance_Procedures-and-Forms_FINAL_Sept-2019.pdf
- **Retrieved:** 2026-09-06T14:25:01.721Z
- **Applicability:** APPLICABLE — 'uic-academic-grievance' is the only source matching this scope with no unresolved competing claim
- **Case evaluated as of:** 2026-03-10T00:00:00Z
- **Case data:** synthetic case data; real, live-acquired institutional source

## Findings

_No step-by-step procedural requirement (notice periods, ordering, required steps) was compiled for this case, so there is nothing to report as conforming or not. The deadlines below are what this analysis produced._

## Deadlines, on both sides

| Who | What the procedure requires of them | Due | Where that stands |
| --- | --- | --- | --- |
| student | MUST request_formal_hearing | 2026-03-30 | **pending** — still running |
| institution | MUST issue_administrative_officer_decision | 2026-03-16 | **pending** — still running |

- **uic-student-request-hearing** — deadline has not yet passed
  > Limitations imposed upon the Grievant for filing appeals of decisions will be calculated from the date that any decision is received by the Grievant, or is due, whichever date is earlier.
- **uic-ao-decision** — deadline has not yet passed
  > The Administrative Officer’s decision must be issued in writing, within ten (10) days following their receipt of the Academic Grievance.

**If nothing else is recorded, the same procedure implies:**

- by **2026-03-18T00:00:00Z** — NEW_DEVIATION_DETECTED: uic-ao-decision pending → missed
- by **2026-04-02T00:00:00Z** — NEW_DEVIATION_DETECTED: uic-student-request-hearing pending → missed; uic-ao-decision pending → missed

_This states what the published procedure implies at a stated instant under the requester's assumptions. It is not a prediction of what the institution will do. Full scenarios and assumptions are below._

## What Recourse could not determine

- **REJECTED_CLAIM** — uic-fabricated-expedited-decision [rawProposal.quotedText]: quoted text not found verbatim in captured source 'uic-academic-grievance' -- cannot derive a hash or span for text that does not exist in the source (stale proposal, or source has changed since the model read it)

## What this record does not claim

**No remedy or outcome is inferred here.** A finding in this record says only whether the recorded process matches the published procedure. It does not establish that a decision was wrong, that any remedy is owed, what an institution will decide, or any legal entitlement. Recourse does not write appeals, does not file anything, and is not legal advice.

Recourse compares a published institutional procedure against the recorded events of one case. It does not infer a remedy, a legal entitlement, guilt, innocence, or any guaranteed institutional outcome. A finding in this record states only whether an observed process matches a procedural rule that was validated against quoted text in the governing source; where the record is incomplete, the finding is UNDETERMINED rather than resolved in either party's favour. This is a procedural record, not legal advice.

---

# Evidence and working

_Everything the summary above rests on: which documents were fetched and what they hashed to, which claims were accepted, which were refused and why, and the case's full event record. A reader who wants to check the finding rather than read it starts here._

## Governing authority, in full

**Resolution:** APPLICABLE
**Why:** 'uic-academic-grievance' is the only source matching this scope with no unresolved competing claim

**Governing source:** `uic-academic-grievance`
**Supporting sources:** none

## Sources as captured

### `uic-academic-grievance`
- Final URL: https://oae.uic.edu/wp-content/uploads/sites/32/2019/10/UIC_Student_Academic_Grievance_Procedures-and-Forms_FINAL_Sept-2019.pdf
- Retrieved: 2026-09-06T14:25:01.721Z
- Content type: application/pdf
- Raw document hash: `sha256:2ff5a5abbc2553879d3d8201de20a10ae646a114e51eaa09a9f2c132c075477c`
- Canonical text hash: `sha256:3cfacf12cd43bf0d68a4f18b39ab1b82c1492a26c93935b6fc90c7fb99fe2577`
- Extractor: pdf-parse v2.4.5

## What was validated, and what was refused

Validated claims: **2** · Refused: **1** · Held for human review: **0**

### Validated

**`uic-ao-decision`** (policy_rule, directly_stated) — source `uic-academic-grievance`
> The Administrative Officer’s decision must be issued in writing, within ten (10) days following their receipt of the Academic Grievance.

**`uic-student-request-hearing`** (policy_rule, directly_stated) — source `uic-academic-grievance`
> Limitations imposed upon the Grievant for filing appeals of decisions will be calculated from the date that any decision is received by the Grievant, or is due, whichever date is earlier.

### Refused

- `uic-fabricated-expedited-decision` (policy_rule) — rawProposal.quotedText: quoted text not found verbatim in captured source 'uic-academic-grievance' -- cannot derive a hash or span for text that does not exist in the source (stale proposal, or source has changed since the model read it)

### Held for human review

_None._

## The procedure as validated

**Parties:** institution, student

## The case record (append-only)

| When | Event | Id |
| --- | --- | --- |
| 2026-03-02T09:00:00Z | case_opened | `uic-e1` |
| 2026-03-02T09:00:00Z | grievance_filed | `uic-e2` |

## Findings — full computation and warrants

_No conformance rules were validated for this case._

## Obligations — full detail

| Obligation | Party | Force | Trigger | Due | Status |
| --- | --- | --- | --- | --- | --- |
| `uic-student-request-hearing` — request_formal_hearing | student | MUST | grievance_filed | 2026-03-30 | **pending** |
| `uic-ao-decision` — issue_administrative_officer_decision | institution | MUST | grievance_filed | 2026-03-16 | **pending** |

- `uic-student-request-hearing` — deadline has not yet passed
  source: https://oae.uic.edu/wp-content/uploads/sites/32/2019/10/UIC_Student_Academic_Grievance_Procedures-and-Forms_FINAL_Sept-2019.pdf
  > Limitations imposed upon the Grievant for filing appeals of decisions will be calculated from the date that any decision is received by the Grievant, or is due, whichever date is earlier.
- `uic-ao-decision` — deadline has not yet passed
  source: https://oae.uic.edu/wp-content/uploads/sites/32/2019/10/UIC_Student_Academic_Grievance_Procedures-and-Forms_FINAL_Sept-2019.pdf
  > The Administrative Officer’s decision must be issued in writing, within ten (10) days following their receipt of the Academic Grievance.

## Forecast

_A forecast states what the validated procedure implies at a stated future instant, under assumptions the requester supplied. It is not a prediction of what the institution will do._

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

## Trace integrity

- **Trace version:** 2
- **Trace hash:** `sha256:8b64c458fd2323b8fe5877b76bae9db3f89b79b1d7f5631f3b3a865856b7b7ec`

The trace hash is content-addressed over this captured analysis: the same captured sources, the same case record and the same evaluation instant always produce this hash. It is not a fingerprint of the live web pages — a fresh run that re-fetches those URLs records new retrieval metadata, so its hash will differ even where every finding is identical. Use `recourse drift` to compare a pinned trace against the live sources.

