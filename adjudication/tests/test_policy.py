import numpy as np
import pandas as pd

from shared.config import ADJ_POLICY
from adjudication.src.policy import PolicyConfig, decide


def _frame(**over):
    base = dict(
        dscr=2.0, leverage=1.0, public_records=0, prior_delinquencies=0,
        requested_amount=50_000, annual_revenue=1_000_000, business_score=720,
        score_band="A",
    )
    base.update(over)
    return pd.DataFrame([base])


CFG = PolicyConfig.from_dict(ADJ_POLICY)


def test_low_pd_clean_file_approves():
    out = decide(_frame(), np.array([0.02]), CFG)
    assert out["decision"].iloc[0] == "Approve"


def test_high_pd_declines():
    out = decide(_frame(), np.array([0.50]), CFG)
    assert out["decision"].iloc[0] == "Decline"


def test_mid_pd_refers():
    out = decide(_frame(), np.array([0.20]), CFG)
    assert out["decision"].iloc[0] == "Refer"


def test_knockout_dscr_forces_decline_despite_low_pd():
    out = decide(_frame(dscr=0.8), np.array([0.01]), CFG)
    assert out["decision"].iloc[0] == "Decline"
    assert any("dscr" in r.lower() for r in out["decision_reasons"].iloc[0])


def test_knockout_public_records_forces_decline():
    out = decide(_frame(public_records=1), np.array([0.01]), CFG)
    assert out["decision"].iloc[0] == "Decline"


def test_knockout_prior_delinquencies_forces_decline():
    out = decide(_frame(prior_delinquencies=3), np.array([0.01]), CFG)
    assert out["decision"].iloc[0] == "Decline"


def test_knockout_leverage_forces_decline():
    out = decide(_frame(leverage=7.0), np.array([0.01]), CFG)
    assert out["decision"].iloc[0] == "Decline"


def test_override_thin_dscr_downgrades_approve_to_refer():
    out = decide(_frame(dscr=1.1), np.array([0.02]), CFG)
    assert out["decision"].iloc[0] == "Refer"


def test_override_low_score_downgrades_approve_to_refer():
    out = decide(_frame(business_score=550, score_band="D"), np.array([0.02]), CFG)
    assert out["decision"].iloc[0] == "Refer"


def test_override_large_request_downgrades_approve_to_refer():
    out = decide(_frame(requested_amount=900_000, annual_revenue=1_000_000),
                 np.array([0.02]), CFG)
    assert out["decision"].iloc[0] == "Refer"


def test_override_never_upgrades_decline():
    out = decide(_frame(dscr=1.1), np.array([0.50]), CFG)
    assert out["decision"].iloc[0] == "Decline"


def test_deterministic():
    f = _frame()
    p = np.array([0.20])
    a = decide(f, p, CFG)["decision"].iloc[0]
    b = decide(f, p, CFG)["decision"].iloc[0]
    assert a == b
