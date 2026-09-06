# POLICY_IR.md — Policy Intermediate Representation

> **Design-pass document.** This describes the JSON-Schema policy IR in `schemas/policy.schema.json`
> and the judgment calls behind its shape. It is not the executable contract: the types the engine
> actually enforces are `engine/src/types/policy.ts`, `engine/src/types/authority.ts` and
> `engine/src/types/conformance.ts`, and the input contract an external agent targets is
> `engine/GROK_HANDOFF.md`. Where the two differ, the engine is authoritative — the reasoning here
> still holds, and inline notes mark the places the implementation went further.

Every institutional procedure Recourse touches is compiled from free-text public policy into this IR before any case logic runs against it. The IR is deliberately narrow: it captures only what is needed to gate eligibility, compute deadlines, and drive state transitions. It never captures persuasive content, and it never captures anything not traceable to a specific source passage.

The JSON Schema is `schemas/policy.schema.json`. This document explains each section's purpose and the judgment calls behind its shape.

## 1. `authority` — who governs this, and at what level

```json
"authority": {
  "institution": "University of Illinois Chicago",
  "unit": "Office of the Registrar / campus-wide",
  "decision_types": ["academic_grievance"],
  "authority_level": "campus_wide",
  "supersedes": ["college-level policies unless a college policy is more specific and non-contradictory"],
  "governing_document": "Student Academic Grievance Policy and Procedures"
}
```

`authority_level` is an enum (`campus_wide`, `college_level`, `department_level`, `program_level`) because the single most common real-world failure mode found during research (see `benchmarks/case-07-conflicting-sources.md`, UIC) is a campus-wide policy and a college-level policy that both claim to be "the" grievance procedure. The IR requires every compiled policy to record its own level explicitly so the conflict-resolution rule in `SAFETY.md` (more specific and non-contradictory wins; contradictory requires human escalation, never silent selection) has something to compare.

## 2. `source` — full provenance, always

```json
"source": {
  "url": "https://policies.uic.edu/educational-policy/student-academic-grievance-policy/",
  "fetched_at": "2026-09-05T00:00:00Z",
  "fetch_method": "browser_navigate+snapshot",
  "content_hash": "sha256:...",
  "effective_date": "2017-04-27",
  "last_verified_current": "2026-09-05T00:00:00Z",
  "verification_status": "search_snippet_only"
}
```

`verification_status` is not decorative. It is one of `full_page_fetch`, `search_snippet_only`, `cached_stale`, `unverifiable`. Any downstream case logic built on a policy whose `verification_status` is not `full_page_fetch` must carry that caveat forward into every output the student sees (see `SAFETY.md` §Confidence Propagation). This field exists *because* this very research pass hit `search_snippet_only` for every source in `benchmarks/` — the schema had to be designed to make that an honestly-representable, non-hidden state rather than something the IR format forces you to paper over. (The engine implemented since then does perform real, hashed fetches — see `engine/src/warrant/acquireSource.ts` and `engine/bench/` — so `full_page_fetch` is the normal state on the executable path. The vocabulary is kept because unfetchable sources still happen, and `recourse drift` reports exactly that as `SOURCE_UNAVAILABLE`.)

`content_hash` + `history/` versioning (see `ARCHITECTURE.md`) together let `check-case` detect drift: if the hash of the live page no longer matches the hash pinned to a case, that's a `POLICY_CHANGED` signal, not a silent re-read.

## 3. `trigger` — what adverse decision this policy applies to

```json
"trigger": {
  "decision_types": ["academic_dismissal"],
  "excludes": ["disciplinary/conduct dismissal — different policy"],
  "applies_to_student_types": ["undergraduate"]
}
```

Precise triggers matter because the most damaging error Recourse can make is applying the *wrong* policy to a real decision (e.g., an academic-standing dismissal policy to a Title IX or conduct dismissal, which are almost always governed by an entirely separate document with different rights). `excludes` is mandatory, not optional, to force explicit negative scoping.

## 4. `eligibility` — grounds, and the boundary of what's NOT a ground

```json
"eligibility": {
  "valid_grounds": [
    {"id": "procedural_error", "description": "..."},
    {"id": "non_academic_bias", "description": "..."},
    {"id": "documented_extenuating_circumstances", "description": "..."},
    {"id": "discrimination", "description": "..."}
  ],
  "explicitly_invalid_grounds": [
    {"id": "disagreement_with_academic_judgment", "description": "..."}
  ],
  "grounds_are_exhaustive": true
}
```

`grounds_are_exhaustive: true` is the field that makes `CASE INELIGIBLE` a first-class, confidently-reachable output rather than something Recourse backs into by omission. When a policy enumerates grounds and doesn't say "or other good cause," Recourse must treat the list as closed. `explicitly_invalid_grounds` captures grounds the policy calls out *by name* as insufficient (e.g., grade disagreement) — these are the strongest, most citable basis for telling a student "no" before they burn their one shot (see `benchmarks/case-02-no-valid-ground.md`).

## 5. `student_obligations` and `institution_obligations` — symmetric, not student-only

```json
"student_obligations": [
  {
    "id": "file_appeal",
    "deadline": {"type": "relative", "amount": 15, "unit": "working_day", "from_event": "decision_notice_date"},
    "submission_method": "online portal / named office",
    "consequence_of_miss": "automatic dismissal stands; no further appeal"
  }
],
"institution_obligations": [
  {
    "id": "respond_to_appeal",
    "deadline": {"type": "relative", "amount": 30, "unit": "calendar_day", "from_event": "appeal_receipt_date"},
    "consequence_of_miss": "policy silent — Recourse flags as ESCALATION_AVAILABLE candidate, does not assume automatic win"
  }
]
```

This is the structural bet of the whole project: **most systems only encode the student's clock.** Recourse encodes both, using the same deadline object shape, because an institution that misses its own response deadline with no consequence specified in the policy is a real, common, and currently-invisible-to-students fact pattern (see `benchmarks/case-04-institution-deadline.md`). Note `consequence_of_miss` on the institution side is explicitly allowed to be "policy silent" — Recourse must never invent a consequence (e.g., "the appeal is automatically granted") that the policy doesn't state.

## 6. `business_day_rules` — because naive date math is a real failure mode

```json
"business_day_rules": {
  "unit_used": "working_day",
  "excludes": ["Saturday", "Sunday", "institution-published holidays/closures"],
  "definition_source_quote": "A working day is a day, other than a Saturday, Sunday or bank holiday, when the University is open.",
  "institution_closure_calendar_url": "https://.../term-dates-and-closures"
}
```

Every deadline that uses `working_day` or `business_day` as its unit **must** resolve against this block's `institution_closure_calendar_url`, not against a generic "skip Sat/Sun" assumption — university closures (winter break, spring break, reading days) are frequently multi-week and institution-specific (see `benchmarks/case-09-business-day-edge-case.md`, University of Westminster).

## 7. `required_evidence`

```json
"required_evidence": [
  {"ground_id": "documented_extenuating_circumstances", "evidence_type": "medical_documentation", "required": true, "description": "letter from treating physician, dated"}
]
```

Tied to the specific ground it supports — evidence requirements are not global. This is what drives `EVIDENCE_INCOMPLETE` (see `STATE_MACHINE.md`).

## 8. `escalation`

```json
"escalation": [
  {"level": 1, "body": "Academic Appeals Committee", "available_when": "initial denial"},
  {"level": 2, "body": "Office of the Independent Adjudicator (OIA)", "available_when": "internal process exhausted", "external": true}
]
```

## 9. `terminal_states`

The set of outcomes the policy itself defines as final (e.g., "the Committee's decision is final and not subject to further appeal within the University").

## 10. `ai_use_restrictions`

```json
"ai_use_restrictions": {
  "restricts_ai_authored_narrative": true,
  "quote": "Avoid use of generative AI... your appeal must reflect your personal experience and demonstrate insight and accountability.",
  "source_section": "Academic Suspension Appeal Guide",
  "recourse_behavior": "may summarize facts and cite policy; must not draft first-person narrative for this institution/decision-type"
}
```

This field is read by every Skill before any narrative-adjacent output is produced (see `SAFETY.md` §AI-Authoring Restrictions). Default, absent explicit policy language either way, is **restrictive**: Recourse does not draft personal narrative unless a policy is silent *and* the student explicitly opts in, per `SAFETY.md`.

## 11. `ambiguity_and_conflict`

```json
"ambiguity_and_conflict": {
  "conflicting_sources": [
    {"url": "...", "claim": "3-stage process, no stated informal-resolution exception", "authority_level": "campus_wide"},
    {"url": "...", "claim": "college-level process references different committee composition", "authority_level": "college_level"}
  ],
  "resolution": "unresolved — surfaced to human, no default applied",
  "resolution_rule_used": "SAFETY.md §Conflicting Sources"
}
```

This block is allowed to be non-empty and unresolved. An IR file with an open conflict is a **valid, shippable** compiled policy — the point is that the case logic built on top of it must refuse to guess between the two (see `STATE_MACHINE.md`, cases cannot leave a conflicted policy's gate without a human decision on which source governs).
