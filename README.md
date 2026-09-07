# RECOURSE

RECOURSE checks whether an institutional process is actually following its own published procedure.

A university can miss its own deadline while a student's clock keeps running. In the UIC demo, the
student files an academic grievance on 2 March 2026 and never hears back. The Academic Officer's
decision was due 16 March. The student's window to request a hearing still closes on 30 March,
because the policy runs that window from the date a decision is received *or is due, whichever is
earlier*. Both dates are computed from the published PDF, in business days, because that document
defines its own day unit.

## What it does

1. Grok reads a case and proposes the rules it thinks apply.
2. RECOURSE resolves which document actually governs the decision — or refuses to pick one.
3. Each proposed rule must be supported by a verbatim span in the captured, content-hashed source.
4. Deterministic code computes the deadlines and replays the case's events against the expected
   procedure.
5. Rules the source does not support are rejected, and rules the source only implies are held for
   human review rather than guessed.
6. Everything above — sources, hashes, findings, refusals, what could not be determined — is written
   into a Trace someone else can check.

The model proposes. It does not get to be the evidence.

## Try it

- **Competition post + demo:** https://lnkd.in/p/g_GwSFTy
- **Grok Bot:** https://x.ai/bot/kJ--EFKahgh9CGzrMY0yR
- **Full technical README:** [recourse-grokbot/README.md](recourse-grokbot/README.md)
- **Canonical release:** `v1.0.1-competition`
- **Canonical commit:** `d9c9f6c347b880408553d88e24420ce6108d62b6`

Or run it locally:

```bash
cd recourse-grokbot/engine && npm ci
node src/cli/index.ts analyze examples/uic-grievance.json
```

That example deliberately includes one fabricated rule — an "expedited decision within three (3)
business days" that appears nowhere in the UIC PDF — so a single run shows a refusal next to a
result.

## Why this is different

A policy chatbot answers from the model. Whatever it says about your deadline is a generation, and a
correct-sounding quote from the wrong document reads exactly like a correct one.

RECOURSE treats the model as an untrusted proposer. A claim only becomes executable if the resolved
governing source supports it verbatim, and every consequential number is computed by deterministic
code rather than produced by the model. When the sources conflict, or the evidence is advisory
rather than binding, or a required step simply has not happened yet, the engine returns
`BLOCKED_SOURCE_CONFLICT`, "held for review", or `UNDETERMINED` instead of an answer.

## Evidence

At `v1.0.1-competition`:

- 211 passing tests
- 32 benchmark properties across five real, public university procedures (UIC, Auburn, Case Western
  Reserve, Minnesota, Buffalo)

These are **designed checks** — invariants over hand-encoded cases with pinned sources. They are not
an accuracy score, and RecourseBench deliberately reports no percentage.

```bash
cd recourse-grokbot/engine
npm ci && npm test && npm run bench
```

## Current scope

- The UIC grievance is one worked demonstration, not the boundary of the design; the same pipeline
  runs against four other institutions' procedures in the benchmark.
- Broader procedural domains are an extension path. RECOURSE does not currently support arbitrary
  universities out of the box, and this repository does not claim it does.
- All case data is synthetic. No authenticated systems, no private student records.
- RECOURSE never files, submits, or sends anything, and never modifies a university system.
- It does not infer a remedy, an outcome, an entitlement, guilt, or innocence.
- It is not legal advice.

## Where to look

| | |
| --- | --- |
| [Full technical README](recourse-grokbot/README.md) | The trust pipeline, the three failure modes it guards, RecourseBench |
| [ARCHITECTURE.md](recourse-grokbot/ARCHITECTURE.md) | How RECOURSE sits on Grok Bot primitives |
| [SAFETY.md](recourse-grokbot/SAFETY.md) | Fail-closed rules: source hierarchy, no invented rights, human-approval boundaries |
| [engine/src/](recourse-grokbot/engine/src) | The deterministic engine. No LLM call anywhere in this package. |
| [engine/examples/traces/](recourse-grokbot/engine/examples/traces) | Generated Traces, including the UIC case above |
| [engine/GROK_HANDOFF.md](recourse-grokbot/engine/GROK_HANDOFF.md) | The contract Grok calls: commands, input shapes, what the engine refuses |
