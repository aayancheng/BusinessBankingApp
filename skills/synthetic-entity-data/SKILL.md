---
name: synthetic-entity-data
description: Use when generating a synthetic dataset to develop or evaluate an ML model with no real data, before setting any accuracy/AUC/lift metric gate on synthetic data, or when a model keeps underperforming its target and you suspect the synthetic label is the limit. Covers leakage-safe data-generating processes and choosing reachable gates.
---

# Synthetic Entity Data

## Overview

A synthetic target has a **built-in performance ceiling** set by the noise you injected when you
drew it. **Measure that ceiling before you set a metric gate** — otherwise you (or a subagent)
will burn the build chasing an AUC/lift the data can never produce. This is the single most
common, most expensive synthetic-data mistake.

Core shape of a sound DGP: `entity attributes → latent risk/propensity → observable features
(+ measurement noise) → label drawn as a Bernoulli/sample from the latent`. The label is noisy
on purpose; that noise is what caps achievable accuracy.

## The oracle-ceiling rule (do this BEFORE gating)

Before you commit to any "model must hit X" gate, compute the ceiling two ways:

1. **Noise-free score:** AUC/PR-AUC of the *latent logit itself* (the clean signal before the
   Bernoulli draw) against the drawn label. This is the best any function of the true drivers
   could do.
2. **Oracle model:** train a strong model (e.g. gradient boosting) on the *observable features
   only* and score it. This is the best a real model can do given what's actually observable.

Your gate must sit **comfortably below the lower of those two numbers.** If your desired gate is
at or above the ceiling, the target is **noise-capped** — the gate is mathematically unreachable.

```python
# ceiling check before choosing a gate
from sklearn.metrics import roc_auc_score
print("noise-free latent AUC:", roc_auc_score(y, latent_logit))      # clean-signal ceiling
oracle = LGBMClassifier().fit(X_observable, y)                        # oracle on observables
print("oracle AUC:", roc_auc_score(y, oracle.predict_proba(X_observable)[:, 1]))
# Set the gate (e.g. 0.78) only if it is < both. Else: noise-capped — see below.
```

## When the target is noise-capped: pure-leaf vs consumed

```
Is this target consumed as a FEATURE by any other model in the system?
├─ NO  (pure leaf) ─ and it's a late/independent draw → you MAY sharpen the DGP:
│        reduce its Bernoulli noise / lean its logit on observable drivers, then
│        RNG-safe regenerate. Prove every OTHER column is bit-identical (per-column
│        hashing) so you don't silently move other models' data.
└─ YES (consumed) ─ do NOT fiddle the label. Set an HONEST gate the data supports
         (e.g. top-decile capture ≥ 2x lift, PR-AUC > base rate) and report AUC ungated.
```

Escalate the choice to the human; don't silently weaken a gate or silently regenerate data.

## Leakage deny-list (from day 0)

Maintain an explicit deny-list; **never** let these into features:
- DGP internals: the latent score, the noise term, the raw drawn probability.
- The true label and any post-outcome / future field.
- The **score-reuse contract:** downstream models consume the *saved model's* output
  (predicted score/PD), **never** the true latent the generator used.

Add a leakage assertion in feature engineering that fails if any denied column appears.

## Quick reference

| Step | Do |
|------|-----|
| Design | entity → latent → observable features (+noise) → Bernoulli label |
| Before gating | compute noise-free AUC + oracle AUC; gate must be below both |
| If gate > ceiling | noise-capped → pure-leaf? sharpen+regen : honest gate; escalate |
| Features | exclude DGP internals, label, future fields; assert no leakage |
| Regeneration | change one target's logit only; hash other columns to prove bit-identical |
| Sanity | data dictionary + EDA rank-ordering (does each driver move risk the right way?) |

## Common mistakes

- **Setting the gate from business economics or a round number** (0.80 "feels good") without
  measuring the achievable ceiling first. Economics tells you what you *need*; the ceiling tells
  you what's *possible*. The gate must respect both.
- **`label = f(features)` with no noise** → a trivially perfect, useless toy.
- **Leaking the latent/probability** into features → inflated AUC that collapses on real data.
- **Silently regenerating data** to hit a number when the target is consumed downstream — moves
  other models' inputs. Only pure leaves are safe to sharpen, and only with hash proof.

## Reference implementation

BusinessBankingApp: `shared/data_generator.py` (entity + 24-mo panel + targets), and the two
noise-capped-target escalations in its `SESSION_LOG.md` (EWS = honest gate; Line-Increase =
pure-leaf sharpen with per-column hash proof) — the canonical worked examples of this rule.
