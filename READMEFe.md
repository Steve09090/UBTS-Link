# UBTS-Link Frontend Guide

This document explains the browser interface, its page structure, visual styling, and how user interactions reach application services. For data persistence, application rules, and the MySQL design, see [READMEBe.md](./READMEBe.md).

## 1. Frontend overview

UBTS-Link is a browser-based prototype built with standard HTML, CSS, and JavaScript ES modules. It does not use a frontend framework or a build step. The UI is rendered from the current application state and selected demo role.

The main frontend files are:

| File | Responsibility |
|---|---|
| `index.html` | Browser entry point, document metadata, CSS imports, module script, and mount points. |
| `styles.css` | Main visual system and component/layout styling. |
| `src/ui/polish.css` | Interaction transitions, expandable facility cards, and animation refinements. |
| `src/ui/view.js` | HTML rendering functions for the app shell, role-specific pages, tables, dialogs, and reusable UI fragments. |
| `src/main.js` | Application bootstrap, event handlers, service wiring, rendering, notifications, and UI state. |
| `src/domain/constants.js` | Role labels, navigation definitions, page titles, blood groups, and date/ID helpers shared by the interface. |

## 2. HTML entry point and application shell

`index.html` defines a responsive viewport, page title, theme color, and font stylesheet links for DM Sans and Fraunces. It loads `styles.css` and `src/ui/polish.css`, then starts `src/main.js` as a JavaScript module.

The body contains three mount points:

- `#app` receives the main application shell and active page.
- `#dialog-root` hosts modal dialogs such as requisition submission.
- `#toast-root` displays short-lived success or error messages.

At startup, `main.js` creates the repository and application services, determines the active demo account and its first available page, attaches delegated event listeners, starts synchronization, runs initial requisition and alert checks, and renders the interface.

## 3. Application layout and navigation

The UI shell is produced by `renderApplication()` in `src/ui/view.js`. It contains:

- A dark-green side rail with the UBTS-Link brand, role-appropriate navigation, current facility, and demo identity.
- A top bar with the active page title, current date, role selector, and `LOCAL DEMO` indicator.
- A main content region containing the selected page and a notice explaining browser-local demo limitations.

Navigation entries are defined in `NAVIGATION` in `src/domain/constants.js`. The four roles see different workspaces:

| Role | Main frontend pages |
|---|---|
| Hospital / Blood Bank Officer | Local dashboard, hospital stock, scan app, requisitions, alerts, reports and audit |
| Clinician | Cross-facility availability, own requisitions, alerts |
| UBTS Hub Staff | Hub dashboard, hub inventory, approval queue, facility search, reports and audit |
| System Admin | Facility verification, facility search, system audit trail |

The role selector switches among seeded demonstration accounts. It is not a login form and does not provide production authentication.

## 4. Screens and visible workflows

### Hospital dashboard

The local dashboard presents facility-level available stock, blood groups at or below the six-unit reorder point, stock expiring within seven days, active alerts, recent requests, and scan activity. Shortcuts navigate to scanning and new requisition entry.

### Inventory

The inventory page displays unit-level barcode, blood group, component, facility, expiry date, viral screening status, and inventory status. The search field filters the displayed facility inventory by barcode, blood group, or status. Hospital officers see a shortcut to prefill the dispensing barcode field for an in-stock unit.

### Scan app

The scan page presents two forms:

- **Barcode intake:** captures a barcode, blood group, component, collection date, expiry date, and viral-test status.
- **Dispense or expire:** accepts a barcode and movement event for an in-stock unit held by the current facility.

The interface supports scanner-style keyboard input into a focused text field as well as manual entry. It does not connect to a dedicated scanner device. Validation messages appear in the form, and successful submissions rerender the page and show a toast.

### Requisitions

Clinicians can open a modal dialog to enter blood group, requested quantity, and urgency. Hospital officers see facility requests and can review clinician-submitted requests. Hub staff see requests awaiting hub review, approved requests ready for dispatch, and dispatched requests. Depending on role and status, the table provides review, dispatch, or receipt actions.

### Availability search

Clinicians, hub staff, and administrators can search verified hospital facilities by facility name, district, blood group, or the displayed count. The table shows eligible stock by blood group. Only units that are in stock, have negative screening, and have not expired are included.

### Hub dashboard

The hub dashboard summarizes hub-held stock, units cleared by screening, units expiring within seven days, pending hub-review requests, and linked verified hospitals. It also provides access to the request queue and inventory.

### Alerts

The alert inbox shows active and historical low-stock and expiry alerts. Hub staff can view alerts across facilities; other roles see alerts for their facility. A notice explains that notification messages are queued locally and no SMS or push message is delivered by the demo.

### Reports and audit

The reports page presents available, expiring, and expired unit totals, requisition count, and recent scan events for the permitted facility scope. System administrators have a separate cross-facility audit view.

### Facility and staff verification

Administrators can expand facility cards to inspect associated staff and use controls to verify or unverify staff or a facility. Verifying or suspending a facility also affects the verification state of staff linked to that facility.

## 5. Rendering and state updates

`view.js` builds page content using small rendering helpers for headings, panels, metrics, tables, status pills, request lists, alerts, and audit events. `renderApplication()` checks whether the selected page is allowed for the current role and falls back to that role's first page if necessary.

The frontend does not use a virtual DOM. `main.js` updates the interface by rendering HTML into `#app`. On rerender it records and restores expanded facility cards, and the inventory/availability search handler restores the search input focus and caret position after updating results.

User actions are attached through document-level delegated listeners:

- Clicks on elements with `data-page` change pages.
- Clicks on elements with `data-action` dispatch workflow actions such as approval, rejection, dispatch, receipt, verification, or opening/closing a dialog.
- Form submissions are identified by form ID and sent to the corresponding application service.
- Changes to `#role-picker` switch the active seeded role.
- Input in the inventory and availability search fields filters rendered results.
- Pressing Escape closes an open dialog.

Service exceptions are displayed as error toasts for action buttons or inline form errors for form submissions. Successful actions rerender relevant content and display a confirmation toast. Repository synchronization events also trigger a rerender.

## 6. Styling and interaction design

`styles.css` provides the core design system through CSS custom properties for medical forest greens, crimson blood accents, slate surfaces, typography, borders, and multi-layer shadows. It styles the navigation rail, top bar, page headings, metric cards, panels, tables, forms, status pills, notices, alerts, logs, dialogs, and toast messages.

`src/ui/polish.css` adds transitions and hover/active states, a refined expandable facility card, live pulse beacons on emergency alerts, laser scan animations on the barcode station, CSS bar charts, and entry animations for dialogs and toasts. It also honors `prefers-reduced-motion` by minimizing animation and transition durations when the visitor has requested reduced motion.

Key interactive features:
- **Navigation Badge Counters**: Active alert counts and pending requisition orders display live numerical badges directly in the side navigation rail.
- **Stock Capacity Gauges & 1-Click Reorders**: Blood group cards feature interactive visual progress bars indicating safe vs low stock levels with 1-click requisition prefill.
- **Quick-Filter Chips & Tabs**: Real-time filtering across blood groups (O+, O-, A+, etc.), requisition status tabs (Pending, In Transit, Fulfilled), and district filters.
- **Scanner Station Simulator**: An animated laser scan beam with one-click sample barcode generation and in-stock unit quick-pick shortcuts.
- **Unit Inspection Dialog**: Detailed modal showing full IST-128 lifecycle, expiration countdown, viral screening status, and direct dispensing trigger.
- **Reporting & Data Export**: Visual distribution bar charts and CSV export functionality for inventory and audit records.
- **Demo State Reset**: A top-bar control to reset browser storage back to initial seed state instantly for clean demonstration runs.

## 7. Running the frontend

Serve the project folder over HTTP so that the browser can load JavaScript ES modules. From the repository directory, for example:

```powershell
py -m http.server 4173
```

Then open `http://localhost:4173` in a browser. No npm installation or compilation is required. Application data is stored in that browser's local storage; switching browser or device does not share state. The demo can be reset by clearing the site's local storage, which causes the seed data to be loaded again on the next visit.

## 8. Frontend limitations

This frontend is a demonstration client, not a production system. In particular:

- Role switching is for demo purposes and must not be treated as secure identity verification.
- UI checks and hidden/shown actions are not server-side authorization.
- Data is read from and written to browser storage; there is no remote API or connected MySQL database.
- Tab synchronization uses browser events and does not synchronize across users or devices.
- Barcode scanning accepts scanner keyboard input but does not manage scanner hardware.
- Notification states are local outbox records and do not represent successful SMS/push delivery.
- The interface is not intended for live clinical decisions or blood-product handling.

For production, retain the UI only as an untrusted client and connect it to an authenticated server API that enforces access control, validation, inventory transitions, and durable persistence.
