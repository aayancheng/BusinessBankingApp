"""Central configuration: paths, seed, population sizes, market assumptions."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "shared" / "data" / "raw"
PROCESSED = ROOT / "shared" / "data" / "processed"

SEED = 42

# Population
N_BUSINESSES = 12_000        # applicants
PANEL_MONTHS = 24            # months of on-book behavioral history

# Market assumptions (used by Pricing in a later phase; stored here as the single source)
MARKET = {
    "cost_of_funds": 0.035,  # COF / FTP rate
    "lgd": 0.45,             # loss given default
    "opex_rate": 0.010,      # operating cost as a rate on EAD
    "tax_rate": 0.25,
    "capital_ratio": 0.12,   # allocated equity = capital_ratio * EAD (simplified RWA=EAD)
    "base_margin": 0.020,    # target margin baked into reference pricing
    "roe_hurdle": 0.15,
}

# Score scaling (FICO-like target band)
SCORE_MIN = 300
SCORE_MAX = 850

# Ports (for later app phases)
PORTS = {"fastapi": 8100, "express": 3100, "vite": 5180}

RAW.mkdir(parents=True, exist_ok=True)
PROCESSED.mkdir(parents=True, exist_ok=True)
