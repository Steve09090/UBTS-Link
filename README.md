# UBTS-Link

UBTS-Link automates inventory tracking between hospitals and UBTS regional hubs. Every blood unit is identified by its **ISBT 128** barcode (Donation Identification Number, product code and expiry). Stock is kept in a central database, and every scan updates it automatically.

What it does:

- **Intake at hospitals and hubs.** Scanning a unit on arrival registers it, or receives it if it was dispatched to that site, and updates stock straight away.
- **Expiry tracking.** Each unit's expiry date and time come from its barcode. The system shows units expiring soon and units past expiry still on the shelf, and sends a daily expiry digest per site.
- **Dispense and expiry scans.** Scanning a unit as dispensed, expired or discarded updates the inventory database and the unit's history.
- **Automated requisitions.** When a hospital's usable stock plus incoming and requested units falls below its minimum, a requisition for `par − position` goes to its regional hub, and the hub and hospital are notified. The check runs after every relevant scan and on a schedule.
- **Chain of custody.** Units move hub → hospital. A unit is held by exactly one site at a time, and every change is written to an append-only movement log.

## Assumptions

The request referred to "the above document" and "IST-128 barcodes", but the repository only contained a one-line README and no document was attached. I made these assumptions:

- **"IST-128" is read as ISBT 128**, the international standard (ICCBBA) for labelling blood and blood components. Labels are decoded from the DIN (data structure 001), product code (003), blood group (002), and expiry date (004) or date-and-time (005) structures. Collection and production date structures are accepted and ignored. Data identifiers whose length is not known are rejected, because the rest of the message could not be read reliably.
- **Century code:** `c = 0` means 2000–2099, which matches the ISBT 128 example `&>0123661300` = 31 Dec 2012 13:00. Other century codes are mapped as 2000 + 100·c and are untested.
- **Product stock is tracked by product family**, the first five characters of the product code (for example `E0150`). Reorder rules use the family too.
- **Expiry is compared with the server's local clock**, because ISBT expiry times are local blood-bank times with no timezone. Audit timestamps are stored and returned in UTC.
- **Hospital requisitions are supplied by one hub.** Each hospital has one supplying hub.

If the document specifies different rules, tell me and I will adjust the code.

## Architecture

| Part | Location | Notes |
|---|---|---|
| ISBT 128 parser and builders | `app/isbt128.py` | Pure functions, fully unit-tested |
| Data model | `app/models.py` | Sites, units, movements, reorder rules, requisitions, notifications |
| Business rules | `app/services/` | `inventory.py` (scans and stock), `replenishment.py` (requisitions, expiry digests, sweep), `notifications.py` |
| HTTP API | `app/api.py`, `app/schemas.py` | FastAPI, JSON under `/api` |
| Scheduler | `app/main.py` | Background sweep every `UBTS_SWEEP_INTERVAL_SECONDS` (default hourly) |
| Web UI | `static/` | Plain HTML/CSS/JS, no build step. Scan station, inventory and rules, units, requisitions, alerts |
| Demo data | `app/seed.py` | Two hubs, three hospitals, a stock history built through the real scan path |
| Tests | `tests/` | Parser cases and end-to-end workflows over HTTP |

The central database is **SQLite** by default. Set `UBTS_DATABASE_URL` to a PostgreSQL URL (for example `postgresql+psycopg://user:pass@host/ubts`) for a shared deployment. Install the driver yourself, since it is not in `requirements.txt`.

### Unit lifecycle

```
new label ──intake (RECEIVE)──► IN_STOCK @ hub ──dispatch (DISPATCH)──► IN_TRANSIT ──receive (RECEIVE)──► IN_STOCK @ hospital
IN_STOCK @ hospital ──dispense──────────────────────────────────────────────────────────► DISPENSED
IN_STOCK @ any site ──expired (scan only after the expiry time)──────────────────────────► EXPIRED
IN_STOCK @ any site ──discard (damaged or other loss)───────────────────────────────────► DISCARDED
```

Every transition is recorded in `movements`. A unit can only be scanned by the site that holds it, and a unit that is in transit can only be received by its destination.

### Replenishment rule

For each hospital and product family:

```
position = usable units on hand (IN_STOCK, not expired)
         + units in transit to the hospital
         + units requested but not yet dispatched by the hub
if position < min_level:
    raise requisition: quantity = par_level - position
```

Each unit is counted once, so a hospital cannot be ordered twice for the same gap. A requisition is linked to each unit the hub dispatches against it. It is marked **FULFILLED** when the hospital has scanned in the full quantity.

### Expiry

- A unit scanned after its expiry time cannot be dispensed or dispatched. It must be scanned as **Expired**, which is refused before the expiry time.
- Expired units still on the shelf are excluded from usable stock, reported as "past expiry, awaiting disposal" and included in the expiry digest, which is sent at most once per site per UTC day.

## Running it

Requires Python 3.11 or newer.

```bash
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt

python -m app.seed                       # demo data; writes sample_data/intake_labels.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Open http://localhost:8000. Pick a site in the top-right picker. The sample intake labels belong to HUB-NORTH.

- Scanners that act as a keyboard send the barcode followed by Enter, which submits the scan. The field keeps focus between scans.
- To try intake, copy a line from `sample_data/intake_labels.txt` into the barcode field with **Intake** selected at HUB-NORTH.
- Use `python -m app.seed --reset` to rebuild the demo database. This deletes all data.

Tests:

```bash
pytest -q
```

### Configuration

| Variable | Default | Meaning |
|---|---|---|
| `UBTS_DATABASE_URL` | `sqlite:///./ubts_link.db` | Central database |
| `UBTS_EXPIRY_WARNING_DAYS` | `7` | Window for "expiring soon" |
| `UBTS_SWEEP_INTERVAL_SECONDS` | `3600` | Scheduled expiry and replenishment checks; `0` disables |
| `UBTS_WEBHOOK_URL` | unset | If set, each notification is POSTed as JSON here (3-second timeout, best effort) |

## API

All endpoints are under `/api`. Interactive documentation is at `/docs`.

| Method and path | Purpose |
|---|---|
| `POST /api/scan` | Scan a unit: `{site_code, barcode, action, destination_code?, reference?, note?}`. `action` is `RECEIVE`, `DISPATCH`, `DISPENSE`, `EXPIRE` or `DISCARD`. |
| `POST /api/parse` | Decode a label without changing stock |
| `GET /api/units?site_code=&status=&expiring_within_days=` | Units at a site |
| `GET /api/units/{din}` | A unit and its full movement history |
| `GET /api/sites`, `POST /api/sites` | List or create hubs and hospitals |
| `GET /api/sites/{code}/stock` | Stock by product family, with expiry position and reorder status |
| `GET /api/rules?site_code=`, `PUT /api/rules` | Reorder rules (minimum and par) for a hospital |
| `GET /api/requisitions?site_code=&role=&status=` | Requisitions for a hub or hospital |
| `POST /api/requisitions` | Manual requisition from a hospital |
| `POST /api/requisitions/{id}/cancel` | Cancel an open requisition |
| `GET /api/notifications?site_code=` | Alerts for a site |
| `POST /api/sweep` | Run the scheduled checks now |
| `GET /api/movements?site_code=` | Recent movement log |

Errors are returned as `{"detail": "..."}`. Rule violations use 409, unknown units 404, and undecodable barcodes 422.

## Limitations

- **No authentication or roles yet.** Anyone who can reach the server can scan and change stock. Put it behind your identity provider or VPN, and add per-site roles before production use.
- **Only some ISBT structures are used.** DIN, product code, blood group and expiry are stored. Collection and production dates are accepted but not stored. Data identifiers outside the supported table are rejected.
- **Units are not returned to a hub.** There is no reverse movement from a hospital back to a hub.
- **Hub stock is not checked when a requisition is raised.** The hub is notified and sees the open requisition, but the system does not know whether it can fill it.
- **Webhook delivery is best effort** and is not retried. Notifications are always stored in the database.
- The product-family names are not decoded to clinical descriptions. Reorder rules use the raw codes.
- Expiry is compared with the server's local clock, so keep the server on the correct local time zone.
