import pytest
from fastapi.testclient import TestClient

from portal.server.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _a_booked_id(client):
    # the pricing portfolio is booked-only; pull one id from the cached frame via the API:
    # use adjudication list then verify via pricing 200, else iterate a few.
    items = client.get("/api/adjudication/applications", params={"per_page": 50}).json()["items"]
    for it in items:
        if client.get(f"/api/pricing/{it['business_id']}").status_code == 200:
            return it["business_id"]
    raise AssertionError("no booked id found in first 50")


def test_portfolio_shape(client):
    s = client.get("/api/pricing/portfolio").json()
    assert set(s) >= {"n", "n_clears", "share_clears", "median_roe", "roe_hurdle",
                      "by_band", "by_industry"}
    assert 0.0 <= s["share_clears"] <= 1.0


def test_detail_known_and_unknown(client):
    bid = _a_booked_id(client)
    body = client.get(f"/api/pricing/{bid}").json()
    assert set(body) >= {"pd", "ead", "quoted_rate", "recommended_rate", "roe_at_quoted",
                         "clears_hurdle", "mispriced", "waterfall_quoted"}
    assert body["ead"] > 0
    assert client.get("/api/pricing/NOPE-NONE").status_code == 404


def test_quote_low_rate_fails_hurdle(client):
    body = client.post("/api/pricing/quote",
                       json={"pd": 0.05, "ead": 100000, "rate": 0.03}).json()
    assert body["clears_hurdle"] is False
    assert "waterfall" in body and "roe" in body


def test_quote_high_rate_clears(client):
    body = client.post("/api/pricing/quote",
                       json={"pd": 0.02, "ead": 100000, "rate": 0.20}).json()
    assert body["clears_hurdle"] is True
