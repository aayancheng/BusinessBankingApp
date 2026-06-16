import pytest
from fastapi.testclient import TestClient

from portal.server.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _a_candidate_id(client):
    items = client.get("/api/line-increase/candidates", params={"per_page": 5}).json()["items"]
    assert items, "expected at least one eligible candidate"
    return items[0]["business_id"]


def test_candidates_shape_and_pagination(client):
    body = client.get("/api/line-increase/candidates", params={"per_page": 10}).json()
    assert set(body) >= {"items", "page", "pages", "total"}
    assert body["total"] > 0
    assert len(body["items"]) <= 10
    row = body["items"][0]
    assert set(row) >= {"business_id", "prob", "recommended_amount", "incremental_roe",
                        "clears_hurdle"}
    assert row["recommended_amount"] > 0
    assert row["clears_hurdle"] is True  # candidates list is eligible-only


def test_detail_known_and_unknown(client):
    bid = _a_candidate_id(client)
    body = client.get(f"/api/line-increase/{bid}").json()
    assert set(body) >= {"recommended_amount", "post_increase_utilization", "incremental",
                         "waterfall", "top_shap_reasons", "eligible"}
    assert body["incremental"]["clears_hurdle"] is True
    assert body["post_increase_utilization"] <= body["utilization_onbook"] + 1e-9
    assert client.get("/api/line-increase/NOPE-NONE").status_code == 404


def test_simulate_amount_changes_exposure(client):
    bid = _a_candidate_id(client)
    small = client.post("/api/line-increase/simulate",
                        json={"business_id": bid, "proposed_amount": 5000}).json()
    big = client.post("/api/line-increase/simulate",
                      json={"business_id": bid, "proposed_amount": 50000}).json()
    # ROE is EAD-invariant; exposure scales with the proposed amount.
    assert big["incremental"]["incremental_ead"] > small["incremental"]["incremental_ead"]
    assert abs(big["incremental"]["roe"] - small["incremental"]["roe"]) < 1e-9
    assert client.post("/api/line-increase/simulate",
                       json={"business_id": "NOPE"}).status_code == 404


def test_segments_shape(client):
    body = client.get("/api/line-increase/segments").json()
    assert set(body) >= {"by_band", "by_industry"}
    row = body["by_band"][0]
    assert set(row) >= {"key", "offer_rate", "expected_incremental_exposure", "count"}
    assert 0.0 <= row["offer_rate"] <= 1.0
