# UBTS-Link Backend Guide

This document describes the data and application logic behind UBTS-Link. It complements [README.md](./README.md), which covers the user interface and how to run the prototype.

## 1. Backend at a glance

UBTS-Link demonstrates workflows for managing blood-unit inventory across hospitals and UBTS hubs. Its code is divided into:

- **Application services** in `src/application/`, which implement authorization checks, inventory operations, requisitions, alerts, reports, and synchronization.
- **A browser-local repository** in `src/data/local-repository.js`, which loads and saves application state in `localStorage`.
- **Seed data** in `src/data/seed.js`, used when no usable saved state is present.
- **External adapters** in `src/external/`, currently a barcode normalizer and a demonstration notification outbox.
- **A MySQL schema** in `database/schema.sql`, which describes a possible centralized persistence model but is not connected to the running application.

The application is initialized and wired together in `src/main.js`. The browser runs the service logic directly; there is currently no server process, HTTP API, database connection, or live messaging provider.

## 2. Current persistence and synchronization

### Browser repository

`LocalRepository` stores the complete application state as JSON under the `ubts-link-platform-v2` local-storage key. The state contains facilities, staff, units, requisitions, fulfillment records, scan events, alerts, and queued demo messages.

When the key does not contain valid state with facility and unit arrays, the repository creates a fresh state using `createSeedState()` and saves it. `save(eventType)` writes the current state and notifies the current page and other open tabs. The repository uses:

- A `CustomEvent` named `ubts:sync` for updates in the current page.
- `BroadcastChannel` when supported for updates between tabs.
- The browser `storage` event as a fallback for changes made in another tab.

`SyncEngine` subscribes to repository notifications and asks the UI to render again. This is browser-tab synchronization, not network synchronization: it does not share state across browsers, devices, or facilities.

The storage implementation is a prototype repository, not a transactional database. Multiple tabs can overwrite each other's changes, and local browser data can be edited or cleared by the user.

### Demo accounts and seed records

The seed includes four facilities, six staff records, sample unit inventories, two pending requisitions, and empty fulfillment, scan-event, alert, and outbox collections. The seeded accounts used by the role selector are:

| Role | Demo staff ID | Facility |
|---|---|---|
| Hospital / Blood Bank Officer | `STF-001` | Kampala Regional Hospital |
| Clinician | `STF-002` | Kampala Regional Hospital |
| UBTS Hub Staff | `STF-003` | Central Region UBTS Hub |
| System Admin | `STF-004` | Central Region UBTS Hub |

These are demonstration identities. The selector switches the active role; it does not authenticate a person or establish a secure session.

## 3. Application services

### Authorization and verification

`AuthService` restores the selected demo role from a separate local-storage session key and resolves that role to one of the seeded staff records. Service methods call `require(...)` to check that:

1. The selected staff record and its facility are both marked verified.
2. The selected role is allowed for the requested operation.

The system administrator can verify or unverify a facility and its associated staff together, or change an individual staff member's verification status. Changes are saved to the local repository.

These checks demonstrate application rules only. Because the application runs in the browser and the role selector can change roles, they are not a security boundary. A deployed system must authenticate users and enforce authorization on a trusted server.

### Inventory intake, stock, and movement

`InventoryService` is responsible for adding and moving units:

- **Stock counts** include only units at the requested facility that are `in_stock`, have a negative viral-screening result, and have an expiry date later than today.
- **Intake** is limited to a verified hospital officer. It normalizes the barcode, checks the blood group, rejects duplicate barcodes, validates collection and expiry dates, and rejects units with a positive viral-screening result. A pending screening result creates a quarantined unit; a negative result creates an in-stock unit.
- **Dispensing or expiry scanning** is also limited to a verified hospital officer. The unit must belong to that officer's facility, be in stock, and have negative screening. A scan changes its status and creates a scan-event record.
- After stock changes, the service reevaluates automatic low-stock requisitions, refreshes alerts, and saves the updated repository.

The low-stock threshold is six eligible units per blood group. Inventory summaries report counts by blood group, total eligible stock, and the number of blood groups at or below that threshold.

`BarcodeScanner` trims and uppercases input, then rejects values shorter than four or longer than 64 characters and values containing control characters. It is an input normalizer for scanner or typed input, not a connection to a particular scanner device.

### Requisition workflow

`RequisitionService` handles manually submitted and automatically generated requests:

1. A clinician can submit a request that starts in `awaiting_facility_review`.
2. A hospital officer can submit a request that starts in `awaiting_hub_review`.
3. A hospital officer reviews a clinician's request for their own facility, approving it for hub review or rejecting it.
4. Staff at the hospital's linked hub approve or reject a request awaiting hub review.
5. After approval, hub staff can dispatch it if the hub has enough eligible units of the requested blood group. The units are marked `in_transit` and linked to fulfillment records.
6. A hospital officer at the requesting facility receives a dispatched request. The units move to that facility, return to `in_stock`, and the request becomes fulfilled.

Submitted quantities must be whole numbers from 1 through 100. Dispatch only selects units held by the linked hub that are in stock, negatively screened, and not expired. It fails if there are not enough eligible units; it does not partially dispatch a request.

The service also creates automatic requests for verified hospitals with a verified linked hub when a blood group's eligible stock is at or below six and there is no active request for that facility and blood group. The generated amount aims to raise stock toward twice the threshold, with a minimum of six units. It is marked urgent when current eligible stock is two units or fewer, and routine otherwise. Rejected and fulfilled requests do not block another automatic request.

### Alerts and notification outbox

`AlertEngine.refresh()` performs the prototype's periodic inventory checks:

- In-stock units whose expiry date has arrived are marked expired and receive an automatic expiry scan event.
- Verified hospitals receive low-stock alerts for blood groups with six or fewer eligible units.
- In-stock units expiring within seven days receive expiry alerts; expired units also receive expiry alerts.
- Alerts no longer associated with an active condition are marked resolved when they have an alert key.

Alerts are added to repository state by `add()`. Each new alert is passed to `NotificationGateway`, which places a `demo` channel message with `queued` status into the local outbox. Nothing is sent to a phone or external service. The UI can display alerts and queued-state messaging; configuring a real provider requires a server-side adapter and delivery/error handling.

### Reports and audit history

`ReportService.snapshot(facilityId)` provides aggregate counts for eligible available units, units expiring within seven days, expired units, requisitions, and scan events. Omitting the facility ID calculates across all facilities; the method requires a hospital officer or hub staff role.

`ReportService.audit(facilityId)` returns scan-event records enriched with their matching unit, facility, and staff data. It requires a hospital officer, hub staff, or system administrator role. Omitting the facility ID returns events across the repository.

These are in-memory reports over the prototype state. The MySQL schema includes indexes intended to support equivalent filtered inventory, requisition, and scan-history queries.

## 4. MySQL data model

The schema creates the `ubts_link` database using `utf8mb4`. Primary keys use `VARCHAR(36)` identifiers, and foreign keys connect records across facilities, staff, blood units, requests, fulfillments, scan events, and alerts.

| Table | Purpose and important constraints |
|---|---|
| `facility` | Facility name, type, district, verification state, creation time, and optional `regional_hub_id` self-reference to its hub. Facility type is hospital, blood bank, or UBTS hub. District and verification indexes support filtering. |
| `staff` | Staff identity, facility, role, password-hash field, verification state, and creation time. The facility is required. Facility and role are indexed. |
| `blood_unit` | Unit barcode, facility, blood type, component, collection/expiry dates, viral-test status, inventory status, and creation time. Barcodes are unique; expiry must be after collection. The facility/type/status/expiry composite index supports eligible stock lookup; expiry also has its own index. |
| `requisition_request` | Requesting facility and optional staff member, blood type, positive requested quantity, urgency, status, automated flag, request time, and review timestamps. Queue and facility/time indexes support review queues and facility history. `staff_id` may be null for automated requests. |
| `requisition_granted` | Fulfillment header linked to one request and a facility, with status and dispatch/receiving timestamps. `request_id` is unique, so there can be at most one fulfillment header per request. |
| `fulfillment_unit` | Join table linking a fulfillment header to each issued blood unit. Its composite primary key prevents duplicate links; a unique constraint on `unit_id` prevents a unit being assigned to multiple fulfillment headers. |
| `scan_event` | Unit movement/audit event, facility, optional fulfillment and staff links, event type, and timestamp. Facility/time and unit/time indexes support audit history. |
| `alert` | Facility alert with optional related request, type, title, detail, creation time, and optional resolution time. An index supports listing active alerts by facility and creation time. |

The schema restricts blood types, components, roles, statuses, and event types with `ENUM` values. It includes a positive-quantity check on requests, a date-order check on blood units, foreign keys, and indexes for common lookup paths.

To create the schema with a locally configured MySQL client:

```powershell
mysql < database\schema.sql
```

The command assumes a MySQL installation and credentials are already configured for the client. The schema file only creates the database and tables; it does not configure an application connection or populate seed records.

## 5. Prototype and schema differences

The SQL model and browser demo are related designs, not interchangeable persistence layers. In particular:

- The running JavaScript uses camel-case object fields, demo identifiers, and local-storage collections; the schema uses relational tables, snake-case columns, and foreign keys.
- No JavaScript module opens a MySQL connection, maps records to SQL, or executes migrations.
- The schema has a fulfillment header plus a `fulfillment_unit` association. The demo currently stores fulfillment records per dispatched unit, each carrying the request ID.
- The alert engine uses a runtime `key` property to deduplicate and resolve generated alerts. The SQL `alert` table does not currently define a corresponding key column or uniqueness constraint.
- The SQL `staff.password_hash` field is part of the future data model. The seeded browser staff records do not contain password hashes or use password authentication.
- The browser demo's facility types and other state values are JavaScript labels; they are not direct SQL enum values in every case.

Before using MySQL in an application, a server-side repository/API would need to define and test the mapping, transaction boundaries, schema migrations, and any required columns or constraints.

## 6. Production considerations

The prototype is for demonstrating workflows and is not suitable for live blood-product handling or clinical decision-making. A production backend should at minimum:

- Put authentication, role checks, facility verification, and input validation on the server.
- Store credentials securely; use the SQL password-hash field with a suitable password-hashing mechanism and never expose database credentials or secrets to the browser.
- Connect to MySQL through a server-side data-access layer, use transactions for dispatch/receive and other multi-record changes, and handle concurrent stock changes safely.
- Enforce the intended request, unit, and fulfillment state transitions in the trusted backend.
- Configure and monitor a real notification provider instead of treating queued demo messages as delivered.
- Provide authenticated network synchronization and operational logging, backups, access controls, and recovery procedures.

See [README.md](./README.md) for the application overview and browser run instructions.
