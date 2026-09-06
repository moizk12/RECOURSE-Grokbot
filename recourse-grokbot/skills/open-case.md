# Skill: open-case

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

**Trigger:** Student provides an institution name and a description of an adverse academic/administrative decision (dismissal, suspension, SAP denial, grievance-eligible incident, etc.), redacted or synthetic. This Skill runs exactly once per new case.

**Owns:** `DISCOVERED` → `PROCEDURE_VERIFIED` (or a `BLOCKED_*` state) → initial `ELIGIBLE`/`INELIGIBLE`/`EVIDENCE_INCOMPLETE` screen.

**Filesystem contract:** writes exactly one new directory under `/cases/{case-id}/`; may write a new `/policies/{institution-slug}/{decision-type-slug}/` entry if none exists yet, or read an existing one if `last_verified_current` is recent enough to reuse.

---

## Step 0 — Refuse out-of-scope requests immediately

Before anything else, check:
- Is this a DePaul-specific request, or does it require any authenticated/institutional-account access? → **Refuse.** State plainly this system does not interact with DePaul or any authenticated system, and stop. Do not proceed to Step 1.
- Is the "adverse decision" actually a disciplinary/conduct or Title IX matter rather than an academic-standing matter? → These are almost always governed by a *different* policy document with different (often much stricter, rights-bearing) procedures. Do not proceed under an academic-grievance or academic-standing policy. Either locate the correct conduct/Title IX policy as a new, separate `trigger.decision_types`, or flag to the human that this needs specialist (often legal) advice this Skill is not scoped to give.

## Step 1 — Intake

Collect from the student, in their own words, verbatim where possible:
- Institution name, campus/college if relevant.
- Exact nature of the adverse decision and the date they were notified.
- Their own account of *why* they believe it was wrong or should be reconsidered — do not prompt them toward a specific ground yet; get their unprompted account first, then map it to the policy's enumerated grounds in Step 4. Prompting toward a ground before showing them the real list risks anchoring them onto language that sounds persuasive rather than what's actually true and actually enumerated.
- Any evidence they already have in hand.

Write this verbatim into `/cases/{case-id}/student_facts.md`, timestamped, attributed as student-provided. This file is the Source-of-Truth Boundary equivalent for this project (see `SAFETY.md` §3, §11): everything downstream about "what happened" traces back to this file or to policy text, never to inference.

## Step 2 — Locate the authoritative policy

1. Search the institution's own domain first (`site:{institution-domain}`-style targeting where the research tool supports it) for the specific decision type. Prefer the registrar/provost/graduate-college/financial-aid office whose remit matches the decision type.
2. Identify every plausible candidate URL — do not stop at the first hit. Note each one's apparent `authority_level` (campus-wide policy register vs. college page vs. office FAQ) per `POLICY_IR.md` §1.
3. Fetch the strongest candidate in full (real browser fetch — `browser_navigate` + `browser_snapshot`, per this project's `AGENTS.md`-equivalent verification discipline, not a search-snippet summary) if the Bot's tooling permits full-page fetch. Record `source.fetch_method`, `source.content_hash`, `source.fetched_at`.
4. If full-page fetch is unavailable or fails for every candidate (see this repository's own `README.md` provenance note for what this looks like in practice), set `source.verification_status: "search_snippet_only"` or `"unverifiable"` as appropriate — do not silently upgrade confidence.
5. If no source at all can be produced with reasonable confidence → **`BLOCKED_SOURCE_UNAVAILABLE`.** Stop here, write the state and reason, tell the student exactly what was searched and what wasn't found.
6. If two-plus sources disagree materially at comparable authority levels → **`BLOCKED_SOURCE_CONFLICT`.** Stop here, record both, ask the human/student to confirm which office actually handles their specific college/program.

## Step 3 — Compile the Policy IR

Populate every required field of `schemas/policy.schema.json` from the fetched source(s), per `POLICY_IR.md`. Non-negotiables:
- `eligibility.grounds_are_exhaustive` must be set based on the policy's own language ("including but not limited to" → `false`; a closed enumerated list → `true`). Do not default this to `false` just because it makes the eligibility check easier — that would silently widen every student's chances beyond what the policy actually allows.
- `institution_obligations` must be populated even when thin (many policies say nothing about institutional response time — in that case, record an empty array plus a note in `SOURCES.md`, not a silent omission).
- `ai_use_restrictions.restricts_ai_authored_narrative` — search specifically for this before finishing. Absence of an explicit statement is coded as `restricts_ai_authored_narrative: true` per `SAFETY.md` §7's default-restrictive rule; only code `false` when the policy affirmatively says AI assistance is acceptable.

Write the compiled policy to `/policies/{institution-slug}/{decision-type-slug}/policy.json`, the raw fetched content to `policy.raw.html`, and a dated copy into `history/`.

## Step 4 — Ground-match against the student's own facts

Show the student the actual enumerated `valid_grounds` (and `explicitly_invalid_grounds` if any) from the compiled policy — the real list, in the policy's own words, not a paraphrase that could drift toward sounding more permissive. Ask the student which ground(s), if any, their own account (from Step 1) actually supports. Do not suggest a ground for them.

- If none match, and `grounds_are_exhaustive: true` → set `state: INELIGIBLE`, `eligibility_determination.result: "ineligible"`, cite the exact policy section, and stop. Say this plainly and first, before anything else in the response. See `SAFETY.md` §2 and `benchmarks/case-02-no-valid-ground.md`.
- If a match exists → `state: ELIGIBLE`, proceed to Step 5.
- If ambiguous whether the facts meet a ground (e.g., the ground exists but it's genuinely unclear if the facts qualify) → do not decide for the student; present the policy's own description of the ground and let the student affirm or withdraw the claim, then re-evaluate.

## Step 5 — Evidence check

For the matched ground, check the student's Step-1 evidence against `required_evidence`. Any required item not yet in hand → `state: EVIDENCE_INCOMPLETE`, with a checklist naming exactly what's missing (evidence type + the policy's own description of what satisfies it, e.g. "a dated letter from the treating physician," not "medical proof").

## Step 6 — Deadline computation

Compute the student's filing deadline using `business_day_rules` and the decision-notice date from Step 1. Show the computation, not just the answer (e.g., "notice: Tue Mar 3 → +15 working days, excluding spring break Mar 16–20 per the institution's closure calendar → due Fri Mar 27"). If `business_day_rules.institution_closure_calendar_url` couldn't be verified, flag the deadline as provisional pending that verification rather than stating it flatly.

## Step 7 — Output

Regardless of terminal sub-state (`INELIGIBLE`, `EVIDENCE_INCOMPLETE`, or continuing toward `READY_FOR_HUMAN`), always output to the student:
1. The state and why, in plain language, first.
2. The exact policy language it's based on, with the source URL and its `verification_status`.
3. What happens next / what's needed next, if anything.

Never produce appeal narrative in this Skill under any circumstance — that is out of scope for `open-case` entirely (see `SAFETY.md` §3, §7); narrative-adjacent output, where ever permitted, is a `check-case`-stage, explicit-opt-in action, not something the initial intake produces.
