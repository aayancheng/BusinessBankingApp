"""Export compact JSON describing the trained Business Credit Score, for the
self-contained HTML explainer page. Prints JSON to stdout."""
import json
import warnings
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from shared.config import RAW
from score.src.feature_engineering import compute_features, FEATURE_COLUMNS
from score.src.train import score_to_fico
from score.src.reason_codes import top_reason_codes

warnings.filterwarnings("ignore")

sc = joblib.load("score/models/scorecard.pkl")
scaling = json.loads(Path("score/models/score_scaling.json").read_text())
meta = json.loads(Path("score/models/metadata.json").read_text())
biz = pd.read_parquet(RAW / "businesses.parquet")
X = compute_features(biz)

with np.errstate(all="ignore"):
    raw = sc.score(X[FEATURE_COLUMNS])
    pd_def = sc.predict_proba(X[FEATURE_COLUMNS])[:, 1]
fico = score_to_fico(raw, scaling["lo"], scaling["hi"])
biz = biz.assign(fico=fico, pd=pd_def)

# 1) Score histogram (25-point bins, 300-850)
edges = list(range(300, 851, 25))
counts, e = np.histogram(fico, bins=edges)
histogram = [{"x0": int(e[i]), "x1": int(e[i + 1]), "count": int(counts[i])}
             for i in range(len(counts))]

# 2) Default rate by grade band
band_edges = [300, 580, 640, 700, 750, 850]
labels = ["D", "C", "B", "A", "AAA"]
band = pd.cut(fico, bins=band_edges, labels=labels, include_lowest=True)
bt = (biz.assign(band=band).groupby("band", observed=True)
      .agg(count=("fico", "size"), default_rate=("default", "mean"),
           avg_score=("fico", "mean")))
band_table = [{"band": str(idx), "count": int(r["count"]),
               "default_rate": round(float(r["default_rate"]), 4),
               "avg_score": int(round(r["avg_score"]))}
              for idx, r in bt.iterrows()]

# 3) Feature predictive power (Information Value; fallback to |coef|*std(WoE))
try:
    summ = sc.binning_process_.summary()
    iv_pairs = [(str(n), float(v)) for n, v in zip(summ["name"], summ["iv"])]
except Exception:
    coef = sc.estimator_.coef_[0]
    woe = sc.binning_process_.transform(X[FEATURE_COLUMNS], metric="woe")
    iv_pairs = [(str(c), abs(float(coef[i]) * float(woe[c].std())))
                for i, c in enumerate(woe.columns)]
iv_pairs.sort(key=lambda t: t[1], reverse=True)
feature_power = [{"name": n, "iv": round(v, 4)} for n, v in iv_pairs]

# 4) Default rate by decile for two intuitive features
def decile_table(col):
    q = pd.qcut(biz[col], 10, duplicates="drop", labels=False)
    g = biz.assign(_d=q).groupby("_d", observed=True).agg(
        default_rate=("default", "mean"), mid=(col, "median"))
    return [{"decile": int(i) + 1, "default_rate": round(float(r["default_rate"]), 4),
             "mid": round(float(r["mid"]), 2)} for i, r in g.iterrows()]

decile = {"dscr": decile_table("dscr"), "utilization": decile_table("utilization")}

# 5) Three example businesses (low / mid / high score)
order = np.argsort(fico)
picks = {"high_risk": int(order[int(0.05 * len(order))]),
         "typical": int(order[int(0.50 * len(order))]),
         "low_risk": int(order[int(0.95 * len(order))])}
samples = {}
for key, idx in picks.items():
    row = biz.iloc[idx]
    reasons = top_reason_codes(sc, X[FEATURE_COLUMNS].iloc[[idx]], k=3)[0]
    samples[key] = {
        "industry": str(row["industry"]),
        "years_in_business": float(row["years_in_business"]),
        "annual_revenue": int(row["annual_revenue"]),
        "dscr": float(row["dscr"]),
        "utilization": float(row["utilization"]),
        "fico": int(row["fico"]),
        "pd": round(float(row["pd"]), 4),
        "reasons": [r["feature"] for r in reasons],
    }

data = {
    "n_businesses": int(len(biz)),
    "overall_default_rate": round(float(biz["default"].mean()), 4),
    "score_range": [int(fico.min()), int(fico.max())],
    "metrics": meta["metrics"],
    "histogram": histogram,
    "band_table": band_table,
    "feature_power": feature_power,
    "decile": decile,
    "samples": samples,
}
print(json.dumps(data))
