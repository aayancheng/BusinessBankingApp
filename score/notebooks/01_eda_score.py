# %% [markdown]
# # EDA — Synthetic SME Population (Business Credit Score)
# %%
import pandas as pd
import matplotlib.pyplot as plt
from shared.config import RAW

biz = pd.read_parquet(RAW / "businesses.parquet")
print("rows:", len(biz), "| default rate:", round(biz["default"].mean(), 3))

# %% [markdown]
# ## Target balance
# %%
print(biz["default"].value_counts(normalize=True))

# %% [markdown]
# ## Numeric feature summary
# %%
num_cols = ["years_in_business", "annual_revenue", "dscr", "current_ratio",
            "leverage", "utilization", "credit_history_months",
            "prior_delinquencies"]
print(biz[num_cols].describe().T)

# %% [markdown]
# ## Default rate by DSCR / utilization deciles (rank-order sanity)
# %%
for col in ["dscr", "utilization", "leverage"]:
    q = pd.qcut(biz[col], 10, duplicates="drop")
    print(f"\n--- default rate by {col} decile ---")
    print(biz.groupby(q, observed=True)["default"].mean().round(3))

# %% [markdown]
# ## Save a couple of charts
# %%
fig, ax = plt.subplots(1, 2, figsize=(11, 4))
biz["pd_default_origination"].hist(bins=40, ax=ax[0]); ax[0].set_title("True PD distribution")
biz.groupby(pd.qcut(biz["dscr"], 10, duplicates="drop"), observed=True)["default"].mean().plot(
    kind="bar", ax=ax[1]); ax[1].set_title("Default rate by DSCR decile")
plt.tight_layout()
fig.savefig("score/docs/eda_overview.png", dpi=110)
print("saved score/docs/eda_overview.png")
