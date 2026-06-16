import pandas as pd

from ews.src.triggers import flag_triggers


def _row(**over):
    base = dict(util_recent=0.5, util_drift=0.0, dpd_max=0, dpd_recent=0,
                deposit_decline_pct=0.0, overdraft_recent=0)
    base.update(over)
    return pd.DataFrame([base])


def test_high_utilization_fires():
    assert "HIGH_UTILIZATION" in flag_triggers(_row(util_recent=0.95))[0]


def test_rising_utilization_fires():
    assert "RISING_UTILIZATION" in flag_triggers(_row(util_drift=0.25))[0]


def test_delinquency_fires_on_dpd_max():
    assert "DELINQUENCY" in flag_triggers(_row(dpd_max=45))[0]


def test_delinquency_fires_on_recent_dpd():
    assert "DELINQUENCY" in flag_triggers(_row(dpd_recent=5))[0]


def test_deposit_decline_fires():
    assert "DEPOSIT_DECLINE" in flag_triggers(_row(deposit_decline_pct=0.5))[0]


def test_overdrafts_fire():
    assert "FREQUENT_OVERDRAFTS" in flag_triggers(_row(overdraft_recent=4))[0]


def test_clean_account_no_triggers():
    assert flag_triggers(_row())[0] == []


def test_vectorized_over_rows():
    df = pd.concat([_row(util_recent=0.95), _row()], ignore_index=True)
    out = flag_triggers(df)
    assert "HIGH_UTILIZATION" in out[0] and out[1] == []
