# UBTS-Link

UBTS-Link is a role-based blood inventory and requisition prototype for hospitals and UBTS regional hubs. It demonstrates barcode intake and dispensing, expiry monitoring, stock alerts, cross-facility availability, requisition review, fulfillment, facility verification, and audit views.

## Architecture

The source is split by layer and responsibility:

- **Client:** `index.html`, `styles.css`, and `src/ui/view.js` provide the clinician portal, hospital scan app, hospital dashboard, UBTS hub dashboard, and administrator screens. `src/main.js` wires user interactions to application services.
- **Application:** `src/application/` contains account and facility authorization, inventory rules, requisition review and fulfillment, alerts, reporting, and synchronization.
- **Data:** `src/data/local-repository.js` and `src/data/seed.js` provide a browser-local demo repository. `database/schema.sql` defines the central MySQL model and its keys, constraints, and indexes.
- **External services:** `src/external/barcode-scanner.js` normalizes scanner input; `src/external/notification-gateway.js` queues demo notifications for an SMS/push provider adapter.

## Roles

- **Hospital / Blood Bank Officer:** local inventory, intake and dispense scans, clinician-request review, hub requisitions, expiry alerts, reports, and audit history.
- **Clinician:** cross-facility availability search, requisition submission, and facility alerts.
- **UBTS Hub Staff:** regional stock dashboard, request approve/reject and dispatch, facility availability search, reports, and audit history.
- **System Admin:** facility and staff verification, plus cross-facility search and audit access.

Use the role selector in the top bar to switch between seeded demo accounts. Verification and role changes are demonstrations only, not secure authentication.

## Run

Serve the folder over HTTP so browser ES modules can load. For example, from this directory run `py -m http.server 4173`, then open `http://localhost:4173`.

The demo persists in browser `localStorage` and synchronizes open tabs in the same browser using `BroadcastChannel`/storage events. It does **not** connect to a server, MySQL, or a live UBTS hub. The schema is a production-oriented data model, not an active connection. Do not use the demo for clinical decisions or live blood-product handling.

For deployment, add a server-side API, password hashing and session/token handling, verified facility authorization, transactional MySQL repositories, network-level real-time events, and a configured SMS/push provider. Keep database credentials and auth secrets on the server.

## Database

Create the MySQL schema with `mysql < database/schema.sql`. `requisition_granted` is one-to-zero-or-one per request; `fulfillment_unit` associates the granted request with each issued blood unit so multi-unit requests remain traceable.