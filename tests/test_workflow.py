"""End-to-end behaviour through the HTTP API: intake, custody, dispensing, expiry and requisitions."""
from datetime import timedelta
from types import SimpleNamespace

from app.isbt128 import build_din_barcode, build_expiry_barcode, build_product_code_barcode, parse_isbt128


def label(clk, serial, days=10, family="E0150", facility="N001"):
    exp = (clk.now + timedelta(days=days)).replace(hour=23, minute=59, second=0, microsecond=0)
    return (build_din_barcode(facility, clk.now.year, serial)
            + build_product_code_barcode(family + "V00")
            + build_expiry_barcode(exp))


def din_of(lbl: str) -> str:
    return parse_isbt128(lbl).din


def din_only(din: str) -> str:
    return f"={din}00"


def scan(client, site, action, barcode, dest=None, reference=None):
    body = {"site_code": site, "barcode": barcode, "action": action}
    if dest:
        body["destination_code"] = dest
    if reference:
        body["reference"] = reference
    return client.post("/api/scan", json=body)


def stock(client, site):
    return {f["product_family"]: f for f in client.get(f"/api/sites/{site}/stock").json()["families"]}


def requisitions(client, site, **params):
    return client.get("/api/requisitions", params={"site_code": site, **params}).json()


def test_intake_registers_unit_and_updates_stock(network, clk):
    r = scan(network, "HUB-N", "RECEIVE", label(clk, 1))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["unit"]["status"] == "IN_STOCK"
    assert body["unit"]["site_code"] == "HUB-N"
    assert stock(network, "HUB-N")["E0150"]["on_hand"] == 1


def test_duplicate_intake_is_refused(network, clk):
    lbl = label(clk, 2)
    assert scan(network, "HUB-N", "RECEIVE", lbl).status_code == 200
    r = scan(network, "HUB-N", "RECEIVE", din_only(din_of(lbl)))
    assert r.status_code == 409
    assert "already in stock" in r.json()["detail"]


def test_first_intake_needs_product_and_expiry(network, clk):
    r = scan(network, "HUB-N", "RECEIVE", din_only("W" + "N001" + "26" + "000003"))
    assert r.status_code == 422
    assert "product code and expiry" in r.json()["detail"]


def test_expired_label_is_refused_at_intake(network, clk):
    r = scan(network, "HUB-N", "RECEIVE", label(clk, 4, days=-1))
    assert r.status_code == 409
    assert "already expired" in r.json()["detail"]


def test_unregistered_unit_cannot_be_dispensed(network, clk):
    r = scan(network, "HOSP-1", "DISPENSE", din_only("W" + "N001" + "26" + "000099"))
    assert r.status_code == 404


def test_chain_of_custody_dispatch_then_receive(network, clk):
    lbl = label(clk, 5)
    din = din_of(lbl)
    assert scan(network, "HUB-N", "RECEIVE", lbl).status_code == 200

    # Dispatch from the wrong hub is refused: HOSP-2 is supplied by HUB-S.
    r = scan(network, "HUB-N", "DISPATCH", din_only(din), dest="HOSP-2")
    assert r.status_code == 409 and "supplied by HUB-S" in r.json()["detail"]

    r = scan(network, "HUB-N", "DISPATCH", din_only(din), dest="HOSP-1")
    assert r.status_code == 200, r.text
    assert r.json()["unit"]["status"] == "IN_TRANSIT"
    assert r.json()["unit"]["transit_to_code"] == "HOSP-1"
    assert stock(network, "HOSP-1")["E0150"]["incoming"] == 1

    # Still at the hub's books while in transit: cannot be dispensed there, nor received by the wrong hospital.
    assert scan(network, "HUB-N", "DISPENSE", din_only(din)).status_code == 409
    wrong = scan(network, "HOSP-2", "RECEIVE", din_only(din))
    assert wrong.status_code == 409 and "in transit to HOSP-1" in wrong.json()["detail"]

    r = scan(network, "HOSP-1", "RECEIVE", din_only(din))
    assert r.status_code == 200
    assert r.json()["unit"]["site_code"] == "HOSP-1"
    assert r.json()["unit"]["status"] == "IN_STOCK"
    assert stock(network, "HOSP-1")["E0150"]["on_hand"] == 1
    assert stock(network, "HUB-N")["E0150"]["on_hand"] == 0


def test_label_that_contradicts_record_is_refused(network, clk):
    lbl = label(clk, 6, days=10)
    assert scan(network, "HUB-N", "RECEIVE", lbl).status_code == 200
    other_expiry = label(clk, 6, days=12)  # same DIN, different expiry
    r = scan(network, "HUB-N", "RECEIVE", other_expiry)
    assert r.status_code == 409 and "does not match" in r.json()["detail"]


def test_dispense_and_discard_update_inventory_and_history(network, clk):
    lbl = label(clk, 7)
    din = din_of(lbl)
    scan(network, "HUB-N", "RECEIVE", lbl)
    scan(network, "HUB-N", "DISPATCH", din_only(din), dest="HOSP-1")
    scan(network, "HOSP-1", "RECEIVE", din_only(din))

    r = scan(network, "HOSP-1", "DISPENSE", din_only(din), reference="ward-3")
    assert r.status_code == 200 and r.json()["unit"]["status"] == "DISPENSED"
    assert stock(network, "HOSP-1")["E0150"]["on_hand"] == 0
    assert scan(network, "HOSP-1", "DISPENSE", din_only(din)).status_code == 409  # closed unit

    history = network.get(f"/api/units/{din}").json()
    assert [m["action"] for m in history["movements"]] == ["RECEIVE", "DISPATCH", "RECEIVE", "DISPENSE"]
    assert history["movements"][-1]["reference"] == "ward-3"


def test_discard_is_allowed_for_any_in_stock_unit(network, clk):
    lbl = label(clk, 8)
    scan(network, "HUB-N", "RECEIVE", lbl)
    r = scan(network, "HUB-N", "DISCARD", din_only(din_of(lbl)), reference="damaged bag")
    assert r.status_code == 200 and r.json()["unit"]["status"] == "DISCARDED"


def test_expiry_scan_requires_an_expired_unit(network, clk):
    lbl = label(clk, 9, days=30)
    din = din_of(lbl)
    scan(network, "HUB-N", "RECEIVE", lbl)
    r = scan(network, "HUB-N", "EXPIRE", din_only(din))
    assert r.status_code == 409 and "does not expire" in r.json()["detail"]


def test_expired_unit_is_flagged_and_scanned_out(network, clk):
    lbl = label(clk, 10, days=1)
    din = din_of(lbl)
    scan(network, "HUB-N", "RECEIVE", lbl)
    clk.advance(days=2)

    assert stock(network, "HUB-N")["E0150"]["expired_on_shelf"] == 1
    assert stock(network, "HUB-N")["E0150"]["on_hand"] == 0
    # Expired stock cannot be dispensed or dispatched, only expired/discarded.
    assert scan(network, "HUB-N", "DISPENSE", din_only(din)).status_code == 409
    assert scan(network, "HUB-N", "DISPATCH", din_only(din), dest="HOSP-1").status_code in (409, 422)

    r = scan(network, "HUB-N", "EXPIRE", din_only(din))
    assert r.status_code == 200 and r.json()["unit"]["status"] == "EXPIRED"
    assert stock(network, "HUB-N").get("E0150", {}).get("expired_on_shelf", 0) == 0
    assert scan(network, "HUB-N", "EXPIRE", din_only(din)).status_code == 409  # closed


def test_low_stock_raises_requisition_and_is_not_duplicated(network, clk):
    # Stock the hub with 6 units, and send 3 to HOSP-1 (min 2, par 4).
    labels = [label(clk, 100 + i) for i in range(6)]
    for lbl in labels:
        assert scan(network, "HUB-N", "RECEIVE", lbl).status_code == 200
    dins = [din_of(lbl) for lbl in labels]
    for din in dins[:3]:            # a batch is dispatched before the hospital scans it in
        scan(network, "HUB-N", "DISPATCH", din_only(din), dest="HOSP-1")
    for din in dins[:3]:
        scan(network, "HOSP-1", "RECEIVE", din_only(din))
    assert stock(network, "HOSP-1")["E0150"]["status"] == "OK"
    assert requisitions(network, "HOSP-1") == []

    # Dispensing two units leaves one on hand, below minimum: a requisition for par - position = 3.
    r = scan(network, "HOSP-1", "DISPENSE", din_only(dins[0]))
    assert r.json()["requisitions_created"] == []
    r = scan(network, "HOSP-1", "DISPENSE", din_only(dins[1]))
    created = r.json()["requisitions_created"]
    assert len(created) == 1
    req = created[0]
    assert req["quantity"] == 3 and req["status"] == "OPEN" and req["trigger"] == "AUTO"
    assert req["hub_code"] == "HUB-N"

    notes = network.get("/api/notifications", params={"site_code": "HUB-N"}).json()
    assert any(n["kind"] == "REQUISITION" and f"Requisition #{req['id']}" in n["message"] for n in notes)
    notes = network.get("/api/notifications", params={"site_code": "HOSP-1"}).json()
    assert any(n["kind"] == "LOW_STOCK" for n in notes)

    # Position = on hand + owed; the open requisition covers the gap, so nothing new is raised.
    assert stock(network, "HOSP-1")["E0150"]["status"] == "ORDERED"
    assert scan(network, "HOSP-1", "DISPENSE", din_only(dins[2])).json()["requisitions_created"] == []
    network.post("/api/sweep")
    assert len(requisitions(network, "HOSP-1")) == 1  # the sweep must not add a second order for HOSP-1

    # Hub ships the 3 units against the requisition; while in transit they still count (no new order).
    for din in dins[3:6]:
        r = scan(network, "HUB-N", "DISPATCH", din_only(din), dest="HOSP-1")
        assert r.json()["movement_id"]
    assert requisitions(network, "HUB-N")[0]["received_qty"] == 0
    network.post("/api/sweep")
    assert len(requisitions(network, "HOSP-1")) == 1  # the sweep must not add a second order for HOSP-1

    # Hospital scans them in: the requisition is fulfilled.
    fulfilled = []
    for din in dins[3:6]:
        r = scan(network, "HOSP-1", "RECEIVE", din_only(din))
        assert r.status_code == 200, r.text
        fulfilled += r.json()["requisitions_fulfilled"]
    assert len(fulfilled) == 1 and fulfilled[0]["status"] == "FULFILLED"
    # 3 received, 3 dispensed, then the 3 requisitioned units arrive: 3 on hand, above the minimum of 2.
    assert stock(network, "HOSP-1")["E0150"]["on_hand"] == 3
    assert stock(network, "HOSP-1")["E0150"]["status"] == "OK"


def test_requisition_is_open_until_all_units_received(network, clk):
    labels = [label(clk, 200 + i) for i in range(4)]
    for lbl in labels:
        scan(network, "HUB-N", "RECEIVE", lbl)
    dins = [din_of(lbl) for lbl in labels]
    # HOSP-1 and HOSP-2 both have nothing: the sweep raises a requisition for each (par 4).
    created = network.post("/api/sweep").json()["requisitions_created"]
    assert len(created) == 2
    assert len(requisitions(network, "HOSP-1")) == 1
    scan(network, "HUB-N", "DISPATCH", din_only(dins[0]), dest="HOSP-1")
    scan(network, "HOSP-1", "RECEIVE", din_only(dins[0]))
    req = requisitions(network, "HOSP-1")[0]
    assert req["status"] == "OPEN" and req["received_qty"] == 1 and req["quantity"] == 4


def test_manual_requisition_notifies_hub_and_can_be_cancelled(network):
    r = network.post("/api/requisitions", json={"hospital_code": "HOSP-2", "product_family": "E0150",
                                                "quantity": 2, "reason": "theatre list"})
    assert r.status_code == 201, r.text
    req_id = r.json()["id"]
    assert r.json()["trigger"] == "MANUAL"
    notes = network.get("/api/notifications", params={"site_code": "HUB-S"}).json()
    assert any(n["kind"] == "REQUISITION" and f"#{req_id}" in n["message"] for n in notes)

    c = network.post(f"/api/requisitions/{req_id}/cancel")
    assert c.status_code == 200 and c.json()["status"] == "CANCELLED"
    assert network.post(f"/api/requisitions/{req_id}/cancel").status_code == 409


def test_expiry_digest_is_sent_once_per_site_per_day(network, clk):
    lbl = label(clk, 300, days=3)  # within the 7-day warning window
    scan(network, "HUB-N", "RECEIVE", lbl)
    first = network.post("/api/sweep").json()["expiry_alerts"]
    second = network.post("/api/sweep").json()["expiry_alerts"]
    assert first == 1 and second == 0
    notes = network.get("/api/notifications", params={"site_code": "HUB-N"}).json()
    assert [n["kind"] for n in notes].count("EXPIRY") == 1


def test_rules_validate_levels_and_site_kind(network):
    bad = network.put("/api/rules", json={"site_code": "HOSP-1", "product_family": "E0150",
                                          "min_level": 5, "par_level": 2})
    assert bad.status_code == 422
    wrong_kind = network.put("/api/rules", json={"site_code": "HUB-N", "product_family": "E0150",
                                                 "min_level": 1, "par_level": 2})
    assert wrong_kind.status_code == 409


def test_parse_endpoint_decodes_without_changing_stock(network, clk):
    lbl = label(clk, 400)
    r = network.post("/api/parse", json={"barcode": lbl})
    assert r.status_code == 200
    assert r.json()["product_family"] == "E0150"
    assert r.json()["din"] == din_of(lbl)
    assert network.get("/api/units").json() == []


def test_units_list_filters_by_expiry_window(network, clk):
    scan(network, "HUB-N", "RECEIVE", label(clk, 500, days=2))
    scan(network, "HUB-N", "RECEIVE", label(clk, 501, days=40))
    soon = network.get("/api/units", params={"site_code": "HUB-N", "expiring_within_days": 7}).json()
    assert len(soon) == 1


def test_webhook_receives_notifications(network, monkeypatch, clk):
    calls = []
    monkeypatch.setattr("app.services.notifications.settings", SimpleNamespace(webhook_url="http://hub.example/hook"))
    monkeypatch.setattr("app.services.notifications.httpx.post",
                        lambda url, json, timeout: calls.append((url, json)) or _Ok())
    network.post("/api/requisitions", json={"hospital_code": "HOSP-1", "product_family": "E0150", "quantity": 1})
    assert calls and calls[0][0] == "http://hub.example/hook"
    assert calls[0][1]["kind"] == "REQUISITION"


class _Ok:
    def raise_for_status(self):
        return None
