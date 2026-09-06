# ARCHITECTURE.md — Recourse on Grok Bot

> **Design-pass document**, describing how Recourse sits on Grok Bot primitives. For what is actually
> implemented and tested, see `README.md` (the trust pipeline), `engine/README.md` (the engine) and
> `engine/GROK_HANDOFF.md` (the external-agent contract).

## Grok Bot primitives this design relies on

Per xAI's Grok Bot documentation (`docs.x.ai/grok-bot/*`, retrieved via search — see the provenance note in `README.md`), a Grok Bot is a **persistent, named agent** that runs on one cloud computer per Bot, with:

- A **browser**, **filesystem**, and **terminal** attached to that computer, persistent across sessions.
- **Skills** — reusable, versioned instruction sets the Bot loads to perform a defined task.
- **Routines** — schedule- or event-triggered workflows a Bot runs on itself (up to 50 per Bot, with the 20 most recent runs of each retained as a log).
- **Plugins/MCP** for external tool integration.
- **Group chats** and **agent-to-agent handoff** for multi-Bot workflows.
- **Human approvals / Auto Review** — a gating mechanism for actions the Bot should not take unilaterally.
- An **egress/network policy** layer controlling what the Bot can reach on the open web.

Recourse is designed as **one Bot**, not a multi-agent swarm, because the case-integrity property that matters most — "never contradict yourself about what the policy says between two sessions" — is easiest to guarantee with one Bot owning one filesystem and one case-state, rather than reconciling state across Bots. The one exception (see "Why not more Bots" below) is deliberate.

## Component map

```
                        ┌─────────────────────────────────────────┐
                        │              Recourse (Bot)              │
                        │                                           │
  Student (chat) ──────▶│  Skill: open-case.md                     │
                        │  Skill: check-case.md                     │
                        │  Routine: case-watch.md  (scheduled)      │
                        │                                           │
                        │  ┌─────────────┐   ┌───────────────────┐ │
  Public web  ◀────────▶│  │  browser    │   │  filesystem state │ │
  (university sites,    │  │  (research, │   │  (policies/, cases/│ │
   only public pages)   │  │  re-verify) │   │   evidence/, log/) │ │
                        │  └─────────────┘   └───────────────────┘ │
                        │                                           │
                        │  Human-approval gate (Auto Review)        │
                        └─────────────────────┬─────────────────────┘
                                               │ status / structured output only
                                               ▼
                                          Student (reads,
                                          acts outside the Bot)
```

Recourse never has network access to any DePaul system, any authenticated portal, or any non-public page. Its browser is scoped (by instruction, and where Grok Bot's network policy allows domain scoping, by configuration) to the public web, with a strong preference for the specific university's own `.edu`/official domain.

## Filesystem layout (the durable state)

```
/policies/
  {institution-slug}/
    {decision-type-slug}/
      policy.json            # current compiled Policy IR (schemas/policy.schema.json)
      policy.raw.html        # last-fetched raw page(s), for audit/diff
      history/
        {fetch-timestamp}.json   # every prior compiled version, never overwritten
      SOURCES.md              # every URL considered, which was chosen authoritative and why,
                               # and any conflicting/rejected sources with reasons

/cases/
  {case-id}/
    case.json                # current Case state (schemas/case.schema.json)
    policy_ref.json          # {policy path, version hash, fetched_at} pinned at case open
    evidence/
      {evidence-id}.md        # student-provided evidence, redacted, timestamped
    events.log.jsonl          # append-only case event log (state transitions, re-verifications,
                               # human decisions) — the audit trail
    student_facts.md          # the student's own stated facts, verbatim, attributed & timestamped

/log/
  routine-runs.jsonl          # case-watch run log (Grok Bot also keeps its own 20-run log per Routine;
                               # this is the case-level detail behind each of those runs)
```

**Why filesystem and not a database:** a Grok Bot's filesystem is already persistent, versionable (it can be diffed and git-tracked if the Bot is given a repo), and directly inspectable by a human without a separate admin UI — which matters because `SAFETY.md` requires every refusal and every source conflict to be auditable in plain text, not buried in a black-box store.

**Immutability of `history/` and `events.log.jsonl`:** these are append-only. A policy that changes is a new version in `history/`, not an edit to the old one — this is what makes the "stale policy" and "changed policy" failure modes (see `benchmarks/`) detectable at all: Recourse can show *which* version of the policy a case was opened under, and whether that version is still current.

## Skills

Two Skills, loaded by name:

- **`skills/open-case.md`** — invoked once per new adverse decision. Owns discovery → verification → IR compilation → initial eligibility screen → case file creation.
- **`skills/check-case.md`** — invoked on any subsequent touch to an existing case (student follow-up, or called by the Routine). Owns re-verification of the pinned policy, obligation-clock evaluation, and state transition.

Both Skills are pure with respect to the filesystem contract: `open-case` writes exactly one new case directory; `check-case` reads and updates exactly one existing case directory. Neither Skill ever deletes a `history/` or `events.log.jsonl` entry.

## The one Routine: `case-watch`

A single scheduled Routine (`routines/case-watch.md`), not one Routine per case. It runs on a fixed cadence (default: daily), iterates every case directory under `/cases/` that is not in a terminal state (`CLOSED`), and for each one invokes the `check-case` Skill's re-verification logic. This keeps Recourse within Grok Bot's per-Bot Routine budget regardless of how many cases a student (or, in a multi-tenant future, many students) has open, and keeps "did the policy change" and "did the institution miss its own deadline" checking centralized in one auditable place instead of scattered across N independent schedules.

## Why not more Bots

The natural objection: shouldn't policy research (browser-heavy, bursty) be a separate Bot from case tracking (filesystem-heavy, steady)? We deliberately reject that split for this phase:

- Splitting them means two Bots must agree on what "the policy" is at any moment, which reintroduces exactly the conflicting-source problem this project exists to prevent — now between two of its own components instead of between two university web pages.
- Grok Bot's group-chat/handoff feature exists for cases where a second Bot brings genuinely separate expertise (e.g., a legal-research specialist Bot). Recourse's policy research is not separate expertise — it's the same task (verify and compile) as the rest of the case lifecycle, just triggered at a different point.

If a future phase adds a second Bot, the only defensible reason is **jurisdiction-specific specialization** (e.g., a UK-institution Bot that owns OIA-escalation knowledge distinct from the US Department of Education Title-IV/SAP-appeal knowledge a US-institution Bot owns) — not a research/tracking split.

## Human-approval boundary

Every transition into `READY_FOR_HUMAN` or later (`STATE_MACHINE.md`) requires the Bot to stop and surface a structured summary; the Bot does not submit, email, upload, or click anything on the student's behalf, ever. Where Grok Bot's Auto Review / human-approval gating is available for outbound actions, Recourse is configured to require approval on every browser action that is not a read-only GET against a public policy page — i.e., approval-by-default, with the narrow read-only research path as the only pre-approved automation. This is enforced procedurally in the Skills (see `SAFETY.md` §Human-Approval Boundaries) since this repository does not include a live Bot configuration to enforce it technically yet.

## What is deliberately out of scope for this phase

- No UI beyond the Bot's native chat surface.
- No integration with any DePaul system, SSO, or authenticated portal of any kind.
- No multi-student/multi-tenant case isolation model (single-student filesystem layout above; tenancy is a v2 concern).
- No actual deployed Bot — this document specifies the target architecture for evaluation, not a running system.
