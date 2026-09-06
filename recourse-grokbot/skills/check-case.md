# Skill: check-case

> ## HISTORICAL — DO NOT FOLLOW THIS SKILL
>
> **This is not the Skill a Bot should run.** It predates the deterministic engine and describes the
> Bot compiling the policy IR and computing deadlines *itself* — which the current design
> specifically forbids. The one current, engine-backed contract is
> [`resolve-recourse-case.md`](resolve-recourse-case.md), where the Bot only proposes quoted claims
> and `recourse analyze` does the capture, verification, authority resolution and arithmetic.
>
> It is kept in the repository for the case-lifecycle reasoning it documents (`SAFETY.md`
> boundaries, refusal states, opt-in narrative rules), which still holds. Where anything here
> conflicts with `resolve-recourse-case.md`, that file wins.

**Trigger:** (a) a student follows up on an existing case ("here's the doctor's note," "I submitted it," "any update?"), or (b) invoked by the `case-watch` Routine on its scheduled sweep.

**Owns:** every state transition after `PROCEDURE_VERIFIED` — evidence updates, deadline re-checks, source re-verification, `SUBMITTED`/`AWAITING_INSTITUTION`/`INSTITUTION_TIMEOUT`/`ESCALATION_AVAILABLE`/`CLOSED`.

**Filesystem contract:** reads and updates exactly one existing `/cases/{case-id}/case.json`; never creates a new case directory (that's `open-case`'s job); appends to `events.log.jsonl`, never rewrites it.

---

## Step 0 — Load and validate

Load `case.json` and its `policy_ref`. Confirm the referenced policy file still exists at `/policies/{...}/history/{hash}.json`. If it doesn't (shouldn't happen given the append-only contract, but check) → treat as `BLOCKED_SOURCE_UNAVAILABLE` and escalate to a human rather than silently reconstructing it.

## Step 1 — Re-verify the source (every invocation, not just Routine sweeps)

1. Re-fetch the pinned `source.url`.
2. Compare `content_hash`. Match → `policy_ref.drift_detected: false`, continue.
3. Mismatch → do not assume the change is cosmetic. Re-run the Policy IR compilation (`open-case` Step 3's logic) against the new content, diff the two compiled IRs field-by-field, and:
   - If the diff only touches non-substantive fields (formatting, contact-info typo fixes) → update `policy_ref` to the new hash, log the diff, continue with the case unaffected.
   - If the diff touches `eligibility`, any `deadline`, `required_evidence`, or `ai_use_restrictions` → `state: BLOCKED_STALE_POLICY`. Surface the specific change to the student/human before continuing. A case that was `EVIDENCE_INCOMPLETE` under old evidence requirements does not silently keep using the old requirements once a change is detected.
4. If re-fetch fails outright (page gone, network blocked) → do not fall back to the last cached copy as if it were still confirmed-current. Downgrade `source.verification_status` accordingly and note the case's information is now unverified-as-of-today, even though it isn't necessarily wrong.

See `benchmarks/case-08-stale-policy.md`.

## Step 2 — Process what triggered this invocation

**If a student provided new evidence:** update the specific `evidence_status[]` entry (never a blanket "evidence: done"). Re-check whether all `required: true` items for the `asserted_ground_id` are now `provided: true`. If yes and the student's own deadline (§ Step 3) hasn't passed → `state: READY_FOR_HUMAN`.

**If a student states they submitted their appeal:** record `state: SUBMITTED` with their stated date/method verbatim in `history`. This is the *only* way `SUBMITTED` is ever set (`SAFETY.md` §8). Compute `institution_obligations[].due_at` from this receipt date and enter `AWAITING_INSTITUTION`.

**If a student asks "any update?" with nothing new:** just re-run Step 1 and Step 3, report current status. Do not manufacture progress.

**If invoked by `case-watch` (no student input this cycle):** skip straight to Step 3.

## Step 3 — Obligation clock check (both parties, every invocation)

For every entry in `student_obligation_status` and `institution_obligation_status` with `status: "pending"`:
1. Recompute `due_at` using current `business_day_rules` (in case Step 1 detected a change) and the institution's actual closure calendar — never a naive Mon–Fri assumption when the policy specifies `working_day`/`business_day` (`benchmarks/case-09-business-day-edge-case.md`).
2. If `due_at < now` and status was `pending` → set `status: "missed"` (student side) or transition case to `INSTITUTION_TIMEOUT` (institution side).
3. **Student side missed:** report the exact consequence from `student_obligations[].consequence_of_miss` — verbatim from policy, e.g. "automatic dismissal stands." Do not soften this or suggest workarounds the policy doesn't offer. If the policy is silent on consequence, say that too, plainly — silence is not the same as "probably fine." See `benchmarks/case-05-severe-consequence.md`.
4. **Institution side missed (`INSTITUTION_TIMEOUT`):** check `institution_obligations[].consequence_of_miss`. If the policy defines a specific consequence (e.g., an automatic right to escalate) → apply it, moving to `ESCALATION_AVAILABLE`. If the policy is silent → say exactly that ("the institution's response deadline of [date] has passed; the policy does not state a consequence for institutional delay") and suggest the student may want to inquire directly — do **not** claim this means the appeal is automatically granted, void, or that any specific right now exists that the policy doesn't state. See `benchmarks/case-04-institution-deadline.md`.

## Step 4 — Escalation check

If the case has reached a decision (institution responded) or `INSTITUTION_TIMEOUT` triggered a policy-defined escalation right, check `escalation[]` for the next level available. If one exists → `state: ESCALATION_AVAILABLE`, present it (body, how, and its own deadline if stated) and let the student decide. If `terminal_states` shows the last decision was final → `state: CLOSED`.

## Step 5 — Opt-in narrative assistance (only here, only if asked, only if policy allows)

If, and only if, the student explicitly asks for help drafting their own appeal text at this stage:
1. Check `ai_use_restrictions.restricts_ai_authored_narrative` on the currently-pinned (re-verified this session) policy.
2. `true` → decline to draft narrative; explain why, quoting the restriction; offer instead a structured fact/evidence outline the student can write from themselves.
3. `false` (policy affirmatively silent-or-permissive, and the student was told this before opting in) → produce a structured fact sheet organized under the policy's evidentiary categories, built only from `student_facts.md` and confirmed evidence — never invented detail, never persuasive rewriting of their voice (`SAFETY.md` §3). Log `ai_narrative_generated: true` and the opt-in event.

See `benchmarks/case-06-ai-authorship-restricted.md` for the case this step exists to catch.

## Step 6 — Output

Same discipline as `open-case` Step 7: state + reason first, exact policy citation with source/verification status, then next action if any. Every re-verification this Skill performed (even a no-op "still current") is appended to `history` so the audit trail shows the Bot actually checked, not just that nothing changed.
