# UBTS-Link

UBTS-Link is a role-based blood inventory and requisition prototype for hospitals and UBTS regional hubs. It demonstrates barcode intake and dispensing, expiry monitoring, stock alerts, cross-facility availability, requisition review, fulfillment, facility verification, and audit views.

## Architecture

The source is split by layer and responsibility:

- **Client:** `index.html`, `styles.css`, and `src/ui/view.js` provide the clinician portal, hospital scan app, hospital dashboard, UBTS hub dashboard, and administrator screens. `src/main.js` wires user interactions to application services.
- **Application:** `src/application/` contains account and facility authorization, inventory rules, requisition review and fulfillment, alerts, reporting, and synchronization.
- **Data:** `src/data/local-repository.js` and `src/data/seed.js` provide a browser-local demo repository. `database/schema.sql` defines the central MySQL model and its keys, constraints, and indexes.
- **External services:** `src/external/barcode-scanner.js` normalizes scanner input; `src/external/notification-gateway.js` queues demo notifications for an SMS/push provider adapter.

## Roles

- **Hospital / Blood Bank Officer:** local inventory grouped by blood type, intake and dispense scans, clinician-request review, multi-group hub requisitions, expiry alerts, reports, and audit history. Confirmed deliveries appear in a received-container queue; opening a container shows received, scanned, and awaiting-scan counts, with unique one-use demo barcodes available as a TXT download.
- **Clinician:** cross-facility availability search, requisition submission, and facility alerts.
- **UBTS Hub Staff:** regional stock dashboard, request approve/reject and dispatch, facility availability search, reports, and audit history.
- **System Admin:** facility and staff verification, plus cross-facility search and audit access.

Use the role selector in the top bar to switch between seeded demo accounts. Verification and role changes are demonstrations only, not secure authentication.

## Run the system

To start the browser demo on Windows, double-click **Run UBTS-Link.bat** in the project folder. It opens the app in your browser and starts the local server; keep the command window open while using the app, and press **Ctrl+C** in that window to stop it. If UBTS-Link is already running, the launcher opens it without starting a second server.

Alternatively, open this project folder in a terminal and start a server manually:

```powershell
py -m http.server 4173
```

If `py` is not recognized, try `python -m http.server 4173`. Then open **http://localhost:4173** in a browser; do not open `index.html` directly from File Explorer. Use the role selector to switch between the sample hospital officer, clinician, UBTS hub staff, and system administrator views. The demo starts with sample facilities, staff, inventory, and requisitions; no login is needed.

No package installation, build step, backend server, or MySQL setup is required to run the browser demo.

The demo saves changes in the current browser's `localStorage`; tabs in that browser synchronize with one another. To start over, clear the site's stored data for `localhost` in your browser and reload the page.

**Important:** this prototype does **not** connect to a backend server, MySQL, or a live UBTS hub. Its role selector is for demonstration, not secure authentication. Do not use it for clinical decisions or live blood-product handling.

## Optional database schema

The SQL file defines a MySQL data model for future backend integration; the browser demo does not read from or write to this database. MySQL is therefore not required to run the prototype.

To create the schema separately, install MySQL and run this from the project folder in Windows Command Prompt:

```cmd
mysql -u root -p < database\schema.sql
```

Enter the MySQL password when prompted. This creates the `ubts_link` database and its tables; connecting the running app to it requires a backend API.

In the schema, `requisition_granted` is one-to-zero-or-one per request, and `fulfillment_unit` associates a granted request with each issued blood unit so multi-unit requests remain traceable.

For deployment, add a server-side API, password hashing and session/token handling, verified facility authorization, transactional MySQL repositories, network-level real-time events, and a configured SMS/push provider. Keep database credentials and auth secrets on the server.