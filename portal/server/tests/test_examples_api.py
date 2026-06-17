from fastapi.testclient import TestClient
from portal.server.main import app

MODULES = ["adjudication", "pricing", "ews", "line_increase", "customer360"]


def test_examples_returns_options_per_module():
    with TestClient(app) as client:
        r = client.get("/api/examples")
        assert r.status_code == 200
        d = r.json()
        for m in MODULES:
            assert m in d
            assert len(d[m]) > 0, f"{m} should have example options"
            for opt in d[m]:
                assert opt["id"].startswith("BIZ")
                assert isinstance(opt["hint"], str) and opt["hint"]


def test_examples_are_diverse():
    """Each module's sample should span more than one category (e.g. not all Approve)."""
    with TestClient(app) as client:
        d = client.get("/api/examples").json()
        # adjudication hints carry the decision; expect at least 2 distinct decisions
        decisions = {h.split("·")[-1].strip() for h in (o["hint"] for o in d["adjudication"])}
        assert len(decisions) >= 2
        # ews should include a High risk example somewhere
        assert any("High risk" in o["hint"] for o in d["ews"])


def test_example_ids_resolve_in_their_module():
    """A pricing example id must resolve via the pricing endpoint (it is booked), etc."""
    with TestClient(app) as client:
        d = client.get("/api/examples").json()
        assert client.get(f"/api/pricing/{d['pricing'][0]['id']}").status_code == 200
        assert client.get(f"/api/ews/{d['ews'][0]['id']}").status_code == 200
        assert client.get(f"/api/customer/{d['customer360'][0]['id']}").status_code == 200
