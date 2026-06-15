import pytest
from fastapi.testclient import TestClient

from portal.server.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:  # triggers lifespan (loads + scores population)
        yield c


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["n_applicants"] == 12000


def test_applications_pagination_shape(client):
    r = client.get("/api/adjudication/applications", params={"per_page": 10})
    assert r.status_code == 200
    body = r.json()
    assert set(body) >= {"items", "page", "pages", "total"}
    assert len(body["items"]) <= 10
    item = body["items"][0]
    assert set(item) >= {"business_id", "industry", "business_score", "pd",
                         "decision", "requested_amount"}


def test_applications_decision_filter(client):
    r = client.get("/api/adjudication/applications",
                   params={"decision": "Decline", "per_page": 25})
    assert r.status_code == 200
    assert all(i["decision"] == "Decline" for i in r.json()["items"])


def test_detail_known_and_unknown(client):
    first = client.get("/api/adjudication/applications",
                       params={"per_page": 1}).json()["items"][0]
    bid = first["business_id"]
    r = client.get(f"/api/adjudication/{bid}")
    assert r.status_code == 200
    body = r.json()
    assert body["decision"] in {"Approve", "Refer", "Decline"}
    assert "pd" in body and "business_score" in body and "key_ratios" in body
    assert set(body["key_ratios"]) >= {"dscr", "leverage", "current_ratio",
                                       "utilization", "debt_to_income"}
    assert client.get("/api/adjudication/NOPE-NONE").status_code == 404


def test_decide_flips_with_inputs(client):
    bad = client.post("/api/adjudication/decide",
                      json={"dscr": 0.5, "requested_amount": 100000}).json()
    assert bad["decision"] == "Decline"
    assert any("dscr" in h.lower() for h in bad["rule_hits"])
    good = client.post("/api/adjudication/decide", json={
        "dscr": 3.0, "leverage": 0.5, "current_ratio": 2.5, "utilization": 0.1,
        "prior_delinquencies": 0, "public_records": 0, "annual_revenue": 5_000_000,
        "net_income": 800_000, "total_debt": 400_000, "requested_amount": 100_000,
    }).json()
    assert good["decision"] in {"Approve", "Refer"}


def test_segments_shape(client):
    body = client.get("/api/adjudication/segments").json()
    assert "by_band" in body and "by_industry" in body
    row = body["by_band"][0]
    assert abs(row["approve"] + row["refer"] + row["decline"] - 1.0) < 0.02
