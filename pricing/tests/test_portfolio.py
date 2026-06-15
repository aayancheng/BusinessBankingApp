from pricing.src.portfolio import price_population, portfolio_summary


def test_price_population_shape():
    df = price_population()
    assert len(df) > 0
    for col in ["business_id", "industry", "score_band", "ead", "quoted_rate",
                "recommended_rate", "roe_at_quoted", "clears_hurdle", "mispriced"]:
        assert col in df.columns
    # ead positive; rates finite
    assert (df["ead"] > 0).all()
    assert df["recommended_rate"].notna().all()


def test_portfolio_summary_keys_and_ranges():
    df = price_population()
    s = portfolio_summary(df)
    for k in ["n", "n_clears", "share_clears", "median_roe",
              "mispriced_ead", "by_band", "by_industry"]:
        assert k in s
    assert 0.0 <= s["share_clears"] <= 1.0
    for row in s["by_band"]:
        assert 0.0 <= row["mispriced_rate"] <= 1.0
        assert set(row) >= {"key", "mispriced_rate", "count"}
