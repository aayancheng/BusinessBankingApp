import pytest
from fastapi.testclient import TestClient

from portal.server.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_watchlist_ranked(client):
    items = client.get("/api/ews/watchlist", params={"limit": 10}).json()
    assert len(items) == 10
    probs = [i["prob"] for i in items]
    assert probs == sorted(probs, reverse=True)
    assert all(i["risk_tier"] in {"High", "Medium", "Low"} for i in items)


def test_detail_has_trajectory(client):
    top = client.get("/api/ews/watchlist", params={"limit": 1}).json()[0]
    body = client.get(f"/api/ews/{top['business_id']}").json()
    assert body["risk_tier"] in {"High", "Medium", "Low"}
    assert isinstance(body["triggers"], list)
    assert len(body["trajectory"]) >= 12
    pt = body["trajectory"][0]
    assert set(pt) >= {"month_index", "utilization", "days_past_due", "balance"}
    assert client.get("/api/ews/NOPE-NONE").status_code == 404


def test_segments_shape(client):
    body = client.get("/api/ews/segments").json()
    assert "by_band" in body and "by_industry" in body
    row = body["by_band"][0]
    assert set(row) >= {"key", "deterioration_rate", "count"}
    assert 0.0 <= row["deterioration_rate"] <= 1.0
