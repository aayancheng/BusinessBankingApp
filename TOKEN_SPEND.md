# Token Spend Report — Business Banking App

Subagent token consumption for the full multi-session build, compiled from the per-session
tallies in [`SESSION_LOG.md`](SESSION_LOG.md). Last updated 2026-06-17.

## Grand total

**≈ 3,499,869 subagent tokens** across **≈ 90 subagent dispatches**, 8 build sessions.

> The earlier "program cumulative" figure quoted mid-build (~3.16M) started counting from the
> Adjudication phase and omitted the 343K from Foundation + Score. The ~3.5M total below
> includes those two early phases.

## By module / phase

| Phase / Module | Subagent tokens | Dispatches | impl / review split |
|---|---:|---:|---|
| Foundation (Phase 0) | ~226,000 | 7 | estimate (not split) |
| Module 0 — Business Credit Score | ~117,000 | ~3 | estimate (not split) |
| Module 1 — Adjudication (backend) | 407,229 | 14 | impl 186,980 / review 220,249 |
| Module 1 — Adjudication (portal) | 534,797 | 12 | impl 264,530 / review 270,267 |
| Module 2 — Pricing & Profitability | 673,580 | 14 | impl 329,003 / review 344,577 |
| Module 3 — Early Warning (EWS) | 712,633 | 15 | impl 411,975 / review 300,658 |
| Module 4 — Proactive Line Increase | 462,931 | 15 | impl 213,475 / review 249,456 |
| Portal Integration (Session 7) | 365,699 | 10 | impl 229,687 / review 136,012 |
| Lookup dropdowns (Session 8) | 0 | 0 | controller-built inline |
| **TOTAL** | **≈ 3,499,869** | **≈ 90** | impl ≈ 1,635,650 / review ≈ 1,521,219 (Adjudication onward) |

Adjudication is the most expensive module at **~942K** (backend + portal combined), followed by
EWS (~713K) and Pricing (~674K). The final Portal Integration was the cheapest substantive phase
(~366K) — pure integration over already-built modules.

## By model (where recorded)

| Phase | Sonnet | Haiku |
|---|---:|---:|
| Module 1 — Adjudication (backend) | 181,558 (6) | 225,671 (8) |
| Module 3 — EWS | 550,018 (11) | 162,615 (4) |
| Module 4 — Line Increase | 351,600 (11) | 111,331 (4) |
| Portal Integration (Session 7) | 331,569 (9) | 34,130 (1) |

Mechanical/transcription tasks (config, test files, exact-spec wiring) were routed to **Haiku**;
integration, debugging, and all reviews used **Sonnet**. Per-model splits for Foundation, Score,
Adjudication-portal, and Pricing were not separately itemized in the ledger.

## Important caveats

1. **Subagent tokens only — not controller spend.** This excludes the main-thread (controller)
   orchestration each session: planning, dispatching, reviewing the reviews, the inline Session 8
   dropdown build, and documentation. That overhead is not separately metered; true end-to-end
   cost is this figure **plus** that unmeasured controller usage.
2. **Foundation + Score are rounded estimates** (~226K, ~117K). Every phase from Adjudication
   onward used the harness's actual `subagent_tokens` and is precise.
3. **Session 8 (lookup dropdowns) = 0 subagent tokens** — it was built inline by the controller,
   so its cost lives in the unmeasured controller bucket, not here.

## Method & efficiency notes

- Build pattern: a fresh **implementer** subagent per task + **two-stage review** (spec
  compliance, then code quality). Reviews were ~48% of total spend (1.52M of 3.16M for the
  itemized phases) — the cost of the quality gate.
- Cost-savers that recurred: combining spec+quality review into one dispatch for exact-transcription
  tasks, and controller-verifying trivial config/test tasks instead of dispatching a reviewer.
- The two genuine **BLOCK escalations** (EWS + Line-Increase noise-capped synthetic targets) were
  the highest-value dispatches of the program — subagents refused to game an unreachable metric
  gate rather than silently weakening it.
