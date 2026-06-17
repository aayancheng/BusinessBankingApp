import pytest
from fastapi.testclient import TestClient

from portal.server.main import app

BOOKED_ID = "BIZ100000"  # known on-book account → all 5 modules present


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_customer_360_booked_full(client):
    r = client.get(f"/api/customer/{BOOKED_ID}")
    assert r.status_code == 200
    d = r.json()
    assert d["profile"]["business_id"] == BOOKED_ID
    assert d["profile"]["booked"] is True
    assert d["profile"]["region"] is not None
    assert d["profile"]["annual_revenue"] is not None
    assert d["score"]["business_score"] > 0
    assert d["adjudication"]["decision"] in ("Approve", "Refer", "Decline")
    assert d["pricing"] is not None
    assert d["ews"] is not None
    assert d["line_increase"] is not None
    assert set(d["modules_present"]) == {
        "score", "adjudication", "pricing", "ews", "line_increase"}


def test_customer_360_applicant_only_has_null_booked_sections(client):
    page = client.get("/api/adjudication/applications",
                      params={"page": 1, "per_page": 500}).json()
    non_booked = None
    for item in page["items"]:
        cand = client.get(f"/api/customer/{item['business_id']}").json()
        if not cand["profile"]["booked"]:
            non_booked = cand
            break
    assert non_booked is not None, "expected at least one non-booked applicant"
    assert non_booked["pricing"] is None
    assert non_booked["ews"] is None
    assert non_booked["line_increase"] is None
    assert non_booked["modules_present"] == ["score", "adjudication"]


def test_customer_360_unknown_id_404(client):
    r = client.get("/api/customer/BIZ_DOES_NOT_EXIST")
    assert r.status_code == 404
