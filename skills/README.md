# Skills — reusable build method extracted from this app

These are **Claude Code skills** generalized from how this BusinessBankingApp was built. They let
Claude build similar **multi-module business-analytics decisioning platforms** in *any* domain
(insurance, SaaS/CRM, supply chain, healthcare, fraud — not just credit). This repo is their
**reference implementation**.

## What's here

| Skill | Purpose |
|-------|---------|
| [`decisioning-platform/`](decisioning-platform/SKILL.md) | The platform playbook: shared entity **score-spine** + N **decision apps** (eligibility / economics / monitoring / next-best-action) + a unified portal. Slot model, platform manifest, the four app archetypes, portal conventions, governance gates. Delegates the generic build cycle to the `superpowers` skills. |
| [`synthetic-entity-data/`](synthetic-entity-data/SKILL.md) | The synthetic-data discipline: leakage-safe data-generating processes, the **oracle-ceiling-before-gate** rule, and the **pure-leaf vs consumed** decision for noise-capped targets. |

`decisioning-platform/references/` holds the detailed archetype recipes and a map from each
pattern to the exact file in this repo that implements it.

## Install (make them active in Claude Code)

Personal skills live in `~/.claude/skills/`. Copy (or symlink) these directories there:

```bash
cp -R skills/decisioning-platform skills/synthetic-entity-data ~/.claude/skills/
# or symlink to keep them in sync with this repo:
# ln -s "$PWD/skills/decisioning-platform" ~/.claude/skills/decisioning-platform
# ln -s "$PWD/skills/synthetic-entity-data" ~/.claude/skills/synthetic-entity-data
```

Then in any project, a request like *"build a decisioning platform for &lt;domain&gt;"* will trigger
`decisioning-platform`; data-generation work triggers `synthetic-entity-data`.

## How they were authored

Built with the `superpowers:writing-skills` TDD-for-skills process: baseline a subagent **without**
the skill (RED), write the skill to close the observed gaps, verify the subagent now complies
(GREEN). See the repo's `SESSION_LOG.md` (Session 9) and
`docs/superpowers/specs/2026-06-17-decisioning-platform-skill-design.md`.

> For a *single* standalone model app (not a multi-module platform), use the separate
> `analytics-project` skill instead.
