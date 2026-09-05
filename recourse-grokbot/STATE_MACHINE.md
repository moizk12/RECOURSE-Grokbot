# STATE_MACHINE.md — Case Lifecycle

States exactly match the `state` enum in `schemas/case.schema.json`. This document is the normative description; the schema is the enforced one.

```
DISCOVERED
   │  (open-case: locate + fetch candidate policy pages)
   ▼
   ├──────────────► BLOCKED_SOURCE_UNAVAILABLE  ──(human resolves / retry later)──► DISCOVERED
   ├──────────────► BLOCKED_SOURCE_CONFLICT      ──(human picks authoritative source)──► PROCEDURE_VERIFIED
   │
   ▼ (single authoritative source confirmed, hash + fetch method recorded)
PROCEDURE_VERIFIED
   │
   ├──────────────► BLOCKED_STALE_POLICY  ──(re-fetch confirms current version)──► PROCEDURE_VERIFIED
   │
   ▼ (eligibility.valid_grounds evaluated against student_facts_summary)
   ├──► INELIGIBLE  [terminal unless student supplies a new, distinct ground]
   │
   ▼
ELIGIBLE
   │
   ├──► EVIDENCE_INCOMPLETE  ──(student supplies missing evidence)──► ELIGIBLE
   │
   ▼ (all required_evidence for asserted_ground_id satisfied, student deadline not yet passed)
READY_FOR_HUMAN
   │  (student reviews structured case output outside the Bot; Bot does not submit anything)
   ▼
SUBMITTED   (student confirms, out-of-band, that they filed; Bot records date/method only)
   │
   ▼
AWAITING_INSTITUTION
   │
   ├──► INSTITUTION_TIMEOUT  ──(institution responds late)──► [re-enter AWAITING_INSTITUTION's
   │        │                                                   downstream branch below]
   │        └──(policy defines a consequence for institutional delay,
   │            e.g. automatic escalation)──► ESCALATION_AVAILABLE
   │
   ▼ (institution issues a decision within or after its own clock)
   ├──► ESCALATION_AVAILABLE  ──(student escalates)──► AWAITING_INSTITUTION (next level)
   │                          ──(student does not escalate, or none available)──► CLOSED
   │
   ▼
CLOSED
```

## State definitions

| State | Meaning | Entry condition | Who/what can exit it, and how |
|---|---|---|---|
| `DISCOVERED` | A case has been opened; institution + decision type known; policy not yet verified. | `open-case` Skill invoked with institution + redacted decision facts. | Bot locates and fetches a candidate authoritative policy page. |
| `BLOCKED_SOURCE_UNAVAILABLE` | No fetchable, sufficiently authoritative public source was found (network egress failure, 404, paywall, or genuinely no published policy). | Fetch attempts exhausted without a usable source. | Human is told exactly what was tried and what failed; case stays here until a human supplies a working URL/document or the Bot's next scheduled retry succeeds. **Never auto-advances on a guess.** |
| `BLOCKED_SOURCE_CONFLICT` | Two or more sources at different or ambiguous authority levels make materially different claims about the same procedure. | `authority.authority_level` comparison in `POLICY_IR.md` §1 cannot resolve the conflict (see `SAFETY.md` §Conflicting Sources). | A human explicitly designates which source governs (or confirms both must be satisfied); this choice is logged in `case.json.history` and cannot be silently made by the Bot. |
| `PROCEDURE_VERIFIED` | Exactly one policy version is pinned to this case (`policy_ref`), with a recorded fetch method and content hash. | Source located, singular, and (ideally) fetched in full — see `verification_status` caveat in `POLICY_IR.md`. | Eligibility screening runs automatically. |
| `BLOCKED_STALE_POLICY` | The pinned policy's `effective_date`/`last_verified_current` is old enough, or a re-verification found the live page has changed, that the Bot cannot certify the pinned text is still in force. | `check-case` Routine re-fetch shows a hash mismatch, or the policy document itself signals a future/past effective-date boundary that brackets "now." | Re-fetch and re-compile; if the substantive rule changed, this reopens as effectively a new `PROCEDURE_VERIFIED` — the case does **not** silently keep operating under stale terms. |
| `ELIGIBLE` | The student's `asserted_ground_id` matches an entry in `eligibility.valid_grounds`. | Ground-matching logic in `check-case`. | Evidence check runs automatically. |
| `INELIGIBLE` | The student's situation matches only `explicitly_invalid_grounds`, or matches nothing in an exhaustive `valid_grounds` list. | Ground-matching logic, `grounds_are_exhaustive: true`. | Terminal for this ground. Bot states this plainly, cites the exact policy language, and does **not** proceed to draft anything. If the student later states a genuinely different, previously-unmentioned fact pattern, the case can be re-screened against a new `asserted_ground_id` — this is not "trying grounds until one sticks"; it requires a materially new fact, logged as such. |
| `EVIDENCE_INCOMPLETE` | Ground is valid but one or more `required_evidence` entries for it are unmet. | Evidence check in `check-case`. | Student supplies evidence; each item is checked off individually (§ schema `evidence_status`), not "evidence: done" as one blob. |
| `READY_FOR_HUMAN` | Ground valid, evidence complete, student's own deadline has not passed. | All gates above cleared. | Bot produces the structured case packet (facts, citations, deadlines, evidence checklist) and stops. This is a hard boundary — see `SAFETY.md` §Human-Approval Boundaries. |
| `SUBMITTED` | Student has told the Bot, out-of-band, that they filed. | Explicit student statement, recorded with date/method. | Institution obligation clock (`institution_obligations`) starts ticking from the recorded receipt event. |
| `AWAITING_INSTITUTION` | Waiting on the institution's own response obligation. | Entered from `SUBMITTED`, or re-entered after an escalation is filed. | `case-watch` Routine checks the institution deadline on every scheduled run. |
| `INSTITUTION_TIMEOUT` | The institution's own `institution_obligations` deadline has passed with no recorded response. | `case-watch` computed `due_at < now` with `status: pending`. | Bot surfaces this to the student. If the policy specifies a consequence for institutional delay (rare — see `POLICY_IR.md` §5), that consequence is applied; if the policy is silent, Bot says exactly that ("policy does not specify a consequence for institutional delay") rather than inventing one, per the `consequence_of_miss` field. |
| `ESCALATION_AVAILABLE` | A decision was issued (or timeout triggered an escalation right) and a next `escalation` level exists in the policy. | Institution decision recorded, or timeout-triggered escalation right per policy. | Student elects to escalate (moves to next `AWAITING_INSTITUTION` cycle against the next escalation level) or not (moves to `CLOSED`). |
| `CLOSED` | No further procedural avenue exists in the policy, or the student elects to stop. | A `terminal_states` entry is reached, or student-initiated stop. | Terminal. Case file remains on disk for the student's own record; `case-watch` no longer polls it. |

## Two properties this state machine is designed to guarantee

1. **No silent skip.** Every `BLOCKED_*` and `INELIGIBLE` state requires a non-empty `state_reason` (enforced by the schema's intent, not yet by a validator in this phase) and an entry in `history` citing the specific policy language or specific fetch failure. There is no path from `DISCOVERED` to `READY_FOR_HUMAN` that does not pass through an explicit, logged ground-eligibility and evidence-completeness check.
2. **Symmetric obligation tracking.** `AWAITING_INSTITUTION` → `INSTITUTION_TIMEOUT` exists as a first-class state precisely because most systems (and most students) only track the deadline pointed at the student. See `benchmarks/case-04-institution-deadline.md` and `case-05-severe-consequence.md`.

## Explicit non-transitions

- Nothing transitions directly from `BLOCKED_SOURCE_CONFLICT` or `BLOCKED_SOURCE_UNAVAILABLE` to `ELIGIBLE`/`READY_FOR_HUMAN`. A blocked source must resolve to a single verified policy first.
- `INELIGIBLE` does not silently retry with a reworded ground to find one that fits — see `SAFETY.md` §No Invented Rights for why this specific temptation is the one most likely to cause real harm.
- `READY_FOR_HUMAN` never auto-advances to `SUBMITTED`. Only the student's own out-of-band statement does that.
