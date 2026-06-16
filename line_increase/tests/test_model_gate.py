import json
from pathlib import Path

import pytest

META = Path("line_increase/models/metadata.json")


@pytest.fixture(scope="module")
def meta():
    if not META.exists():
        pytest.skip("model not trained yet; run python -m line_increase.src.train")
    return json.loads(META.read_text())


def test_auc_and_lift_meet_gate(meta):
    assert meta["metrics"]["auc"] >= meta["gate"]["auc_min"]
    assert meta["metrics"]["top20_lift"] >= meta["gate"]["lift_min"]


def test_cohort_is_lower_risk_higher_util(meta):
    c = meta["cohort"]
    assert c["n_offered"] > 0
    assert c["cohort_pd"] < c["book_pd"]
    assert c["cohort_util"] > c["book_util"]


def test_aggregate_incremental_roe_positive(meta):
    c = meta["cohort"]
    assert c["agg_incremental_roe"] >= c["roe_hurdle"]
