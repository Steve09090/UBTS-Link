import os
import tempfile

# Must be set before the app (and its settings) are imported.
_TMP = tempfile.mkdtemp(prefix="ubts-test-")
os.environ["UBTS_DATABASE_URL"] = f"sqlite:///{_TMP}/test.db"
os.environ["UBTS_SWEEP_INTERVAL_SECONDS"] = "0"
os.environ["UBTS_WEBHOOK_URL"] = ""

import pytest  # noqa: E402
from datetime import datetime, timedelta  # noqa: E402

from fastapi.testclient import TestClient  # noqa: E402

from app import api, clock  # noqa: E402
from app.database import Base, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.services import inventory, replenishment  # noqa: E402


class Clock:
    """Controllable wall clock, patched into every module that compares expiry times."""

    def __init__(self):
        self.now = datetime.now().replace(microsecond=0)

    def advance(self, **kwargs):
        self.now += timedelta(**kwargs)


@pytest.fixture
def clk(monkeypatch):
    c = Clock()
    for mod in (clock, inventory, replenishment, api):
        monkeypatch.setattr(mod, "now_local", lambda c=c: c.now, raising=False)
    return c


@pytest.fixture
def client(clk):
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with TestClient(app) as c:
        yield c


@pytest.fixture
def network(client):
    """Two hubs, two hospitals (one per hub) with reorder rules."""
    post = lambda body: client.post("/api/sites", json=body)  # noqa: E731
    assert post({"code": "HUB-N", "name": "North", "kind": "HUB", "facility_code": "N001"}).status_code == 201
    assert post({"code": "HUB-S", "name": "South", "kind": "HUB", "facility_code": "S002"}).status_code == 201
    assert post({"code": "HOSP-1", "name": "Hospital 1", "kind": "HOSPITAL", "hub_code": "HUB-N"}).status_code == 201
    assert post({"code": "HOSP-2", "name": "Hospital 2", "kind": "HOSPITAL", "hub_code": "HUB-S"}).status_code == 201
    for hosp in ("HOSP-1", "HOSP-2"):
        r = client.put("/api/rules", json={"site_code": hosp, "product_family": "E0150", "min_level": 2, "par_level": 4})
        assert r.status_code == 200, r.text
    return client
