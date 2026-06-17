import pytest
from fastapi.testclient import TestClient

from portal.server.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_dashboard_summary_fields(client):
    r = client.get("/api/dashboard/summary")
    assert r.status_code == 200
    d = r.json()
    for k in ("n_applicants", "model_auc", "pct_clears_hurdle",
              "n_high_risk", "n_eligible_offers", "status"):
        assert k in d
    assert d["status"] == "ok"
    assert d["n_applicants"] > 0
    assert 0.0 <= d["pct_clears_hurdle"] <= 1.0
    assert d["n_high_risk"] >= 0
    assert d["n_eligible_offers"] >= 0
