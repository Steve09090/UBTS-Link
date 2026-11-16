import { BLOOD_TYPES, LOW_STOCK_THRESHOLD, NAVIGATION, PAGE_TITLES, ROLES, formatDate, formatDateTime, today } from '../domain/constants.js';

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));

// SVG Icon Library
export const ICONS = {
  logo: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M2 12h20" stroke="#34d399" stroke-width="2.5"/><circle cx="12" cy="12" r="3" fill="#e11d48" stroke="#ffffff" stroke-width="1.5"/></svg>`,
  overview: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>`,
  hub: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>`,
  inventory: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>`,
  scan: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 8v8"/><path d="M12 8v8"/><path d="M17 8v8"/></svg>`,
  requisitions: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8Z"/><path d="M15 3v5h5"/><path d="m9 14 2 2 4-4"/></svg>`,
  requests: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8Z"/><path d="M15 3v5h5"/><path d="m9 14 2 2 4-4"/></svg>`,
  alerts: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>`,
  reports: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>`,
  availability: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/><path d="M11 8v6"/><path d="M8 11h6"/></svg>`,
  facilities: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>`,
  audit: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  droplet: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>`,
  check: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`,
  chevronRight: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>`,
  sparkles: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/></svg>`,
  download: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`
};

const statusLabel = status => ({
  in_stock: 'In stock',
  in_transit: 'In transit',
  dispensed: 'Dispensed',
  expired: 'Expired',
  quarantined: 'Quarantined',
  awaiting_facility_review: 'Facility review',
  awaiting_hub_review: 'Hub review',
  approved: 'Approved',
  rejected: 'Rejected',
  dispatched: 'Dispatched',
  fulfilled: 'Fulfilled',
  received: 'Received'
}[status] || status.replace(/_/g, ' '));

const statusClass = status =>
  ['in_stock', 'approved', 'fulfilled', 'received'].includes(status) ? 'good' :
  ['rejected', 'expired', 'quarantined'].includes(status) ? 'bad' :
  ['awaiting_facility_review', 'awaiting_hub_review'].includes(status) ? 'warn' : 'info';

const pill = (status, label = statusLabel(status)) =>
  `<span class="pill ${statusClass(status)}">${escapeHtml(label)}</span>`;

const bloodBadge = type => {
  const isUniversal = type === 'O-' || type === 'AB+';
  const tag = type === 'O-' ? 'Universal Donor' : type === 'AB+' ? 'Universal Recipient' : '';
  return `<span class="blood ${isUniversal ? 'universal' : ''}" title="${tag}">${escapeHtml(type)}</span>`;
};

const urgencyPill = urgency => {
  if (urgency === 'emergency') return `<span class="pill bad pulse-emergency">🚨 Emergency</span>`;
  if (urgency === 'urgent') return `<span class="pill warn pulse-warning">⚠️ Urgent</span>`;
  return `<span class="pill info">Routine</span>`;
};

const button = (action, label, kind = 'secondary', data = '') =>
  `<button class="btn btn-${kind} btn-small" data-action="${action}" ${data}>${label}</button>`;

const heading = (eyebrow, title, description, actions = '') =>
  `<header class="page-head"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p>${description}</p></div>${actions ? `<div class="actions">${actions}</div>` : ''}</header>`;

const panel = (title, note, body, action = '') =>
  `<section class="panel"><div class="panel-head"><div><div class="panel-title">${title}</div><div class="panel-note">${note}</div></div>${action}</div>${body}</section>`;

const metric = (label, value, note, kind = '') =>
  `<article class="metric ${kind}"><div class="metric-label">${label}</div><div class="metric-value">${value}</div><div class="metric-note">${note}</div></article>`;

function daysUntil(dateString) {
  const diffTime = new Date(`${dateString}T00:00:00`) - new Date(`${today()}T00:00:00`);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function expiryBadge(expiryDate) {
  const days = daysUntil(expiryDate);
  if (days < 0) return `<span class="pill bad">Expired (${formatDate(expiryDate)})</span>`;
  if (days === 0) return `<span class="pill bad pulse-emergency">Expires Today</span>`;
  if (days <= 7) return `<span class="pill warn pulse-warning">${days}d left (${formatDate(expiryDate)})</span>`;
  return `<span class="pill info">${days}d left</span>`;
}

// -----------------------------------------------------------------------
// Stock Table
// -----------------------------------------------------------------------
function renderStockTable(units, facilities, isHospitalOfficer = false) {
  const rows = units.slice(0, 120).map(unit => {
    const facility = facilities.find(item => item.id === unit.facilityId);
    return `
      <tr>
        <td>
          <button class="link-btn" data-action="inspect-unit" data-barcode="${escapeHtml(unit.barcode)}" title="Inspect unit details">
            <strong>${escapeHtml(unit.barcode)}</strong>
          </button>
        </td>
        <td>${bloodBadge(unit.bloodType)}</td>
        <td>${escapeHtml(unit.component)}</td>
        <td>${escapeHtml(facility?.name || '—')}</td>
        <td>${expiryBadge(unit.expiryDate)}</td>
        <td>${pill(unit.viralTestStatus === 'negative' ? 'in_stock' : unit.viralTestStatus === 'pending' ? 'awaiting_hub_review' : 'rejected', unit.viralTestStatus)}</td>
        <td>${pill(unit.status)}</td>
        <td>
          <div class="actions">
            <button class="btn btn-secondary btn-small" data-action="inspect-unit" data-barcode="${escapeHtml(unit.barcode)}" title="View details">Inspect</button>
            ${isHospitalOfficer && unit.status === 'in_stock' ? `<button class="btn btn-primary btn-small" data-action="prefill-dispense" data-barcode="${escapeHtml(unit.barcode)}">Dispense</button>` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');

  return `
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>IST-128 Barcode</th>
            <th>Blood Group</th>
            <th>Component</th>
            <th>Facility Location</th>
            <th>Expiry Status</th>
            <th>Viral Screening</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td colspan="8" class="empty">No blood units match the current filter or search criteria.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

// -----------------------------------------------------------------------
// Requests Table
// -----------------------------------------------------------------------
function renderRequests(requests, state, session, showActions) {
  const rows = requests.map(request => {
    const facility = state.facilities.find(item => item.id === request.facilityId);
    const staff = state.staff.find(item => item.id === request.staffId);
    let actions = '<span class="muted">—</span>';

    if (showActions && session.role === 'hospital_officer' && request.status === 'awaiting_facility_review') {
      actions = `
        <div class="actions">
          ${button('facility-approve', 'Approve', 'primary', `data-id="${escapeHtml(request.id)}"`)}
          ${button('facility-reject', 'Reject', 'danger', `data-id="${escapeHtml(request.id)}"`)}
        </div>
      `;
    }
    if (showActions && session.role === 'hub_staff' && request.status === 'awaiting_hub_review') {
      actions = `
        <div class="actions">
          ${button('hub-approve', 'Approve', 'primary', `data-id="${escapeHtml(request.id)}"`)}
          ${button('hub-reject', 'Reject', 'danger', `data-id="${escapeHtml(request.id)}"`)}
        </div>
      `;
    }
    if (showActions && session.role === 'hub_staff' && request.status === 'approved') {
      actions = button('dispatch', '🚀 Dispatch units', 'primary', `data-id="${escapeHtml(request.id)}"`);
    }
    if (showActions && session.role === 'hospital_officer' && request.status === 'dispatched' && request.facilityId === session.facilityId) {
      actions = button('receive', '✓ Confirm receipt', 'primary', `data-id="${escapeHtml(request.id)}"`);
    }

    return `
      <tr>
        <td>
          <strong>${escapeHtml(request.id)}</strong>
          ${request.automated ? '<div class="pill info" style="font-size:9.5px; padding:2px 6px; margin-top:3px;">Auto-generated</div>' : ''}
        </td>
        <td>${escapeHtml(facility?.name || '—')}</td>
        <td>${bloodBadge(request.bloodType)}</td>
        <td class="qty">${request.unitsRequested} units</td>
        <td>${urgencyPill(request.urgency)}</td>
        <td style="font-size:12px; color:var(--muted);">${formatDateTime(request.requestTime)}</td>
        <td>${pill(request.status)}</td>
        <td style="font-size:12px;">${escapeHtml(staff?.name || 'System Reorder Alert')}</td>
        <td>${actions}</td>
      </tr>
    `;
  }).join('');

  return `
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Request ID</th>
            <th>Destination Facility</th>
            <th>Group</th>
            <th>Quantity</th>
            <th>Urgency</th>
            <th>Requested At</th>
            <th>Status</th>
            <th>Requester</th>
            <th>Workflow Action</th>
          </tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="9" class="empty">No requisitions in this queue.</td></tr>'}
        </tbody>
      </table>
    </div>
  `;
}

// -----------------------------------------------------------------------
// Alerts List
// -----------------------------------------------------------------------
function renderAlerts(alerts, state) {
  const rows = alerts.filter(alert => !alert.resolvedAt).slice(0, 30).map(alert => `
    <div class="alert-row">
      <span class="alert-dot ${alert.type === 'expiry' ? 'expiry' : ''}"></span>
      <div>
        <div class="alert-title">${escapeHtml(alert.title)}</div>
        <div class="alert-detail">${escapeHtml(alert.detail)} · ${escapeHtml(state.facilities.find(item => item.id === alert.facilityId)?.name || '')}</div>
      </div>
      <div class="actions">
        ${alert.type === 'low_stock' ? `<button class="btn btn-reorder" data-action="quick-reorder" data-blood-type="${alert.title.split(' ')[1] || 'O-'}">⚡ Reorder</button>` : ''}
        <span class="demo-label">${escapeHtml(alert.type.replace('_', ' '))}</span>
      </div>
    </div>
  `).join('');

  return rows || '<div class="empty">No active low-stock or expiry alerts. All supply levels within normal parameters!</div>';
}

// -----------------------------------------------------------------------
// Audit Events List
// -----------------------------------------------------------------------
function renderEvents(events) {
  const rows = events.slice(0, 30).map(event => `
    <div class="log-row">
      <span class="log-time">${formatDateTime(event.timestamp)}</span>
      <div>
        <strong>${escapeHtml(event.eventType.toUpperCase())}</strong> · <span class="blood" style="min-width:30px; height:22px; font-size:11px;">${escapeHtml(event.unit?.bloodType || '—')}</span> ${escapeHtml(event.unit?.barcode || event.unitId)}
        <div class="log-detail">${escapeHtml(event.facility?.name || '')} · Recorded by ${escapeHtml(event.staff?.name || 'System')}</div>
      </div>
      ${pill(event.eventType === 'intake' ? 'in_stock' : event.eventType === 'dispense' ? 'dispensed' : event.eventType === 'transfer' ? 'in_transit' : 'expired', event.eventType)}
    </div>
  `).join('');

  return rows || '<div class="empty">No scan events recorded yet.</div>';
}

// -----------------------------------------------------------------------
// 1. Hospital Overview Page
// -----------------------------------------------------------------------
function overviewPage(state, session) {
  const facility = state.facilities.find(item => item.id === session.facilityId);
  const units = state.units.filter(unit => unit.facilityId === session.facilityId);
  const stock = units.filter(unit => unit.status === 'in_stock' && unit.expiryDate > today());
  const expiring = stock.filter(unit => unit.expiryDate <= new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
  const requests = state.requisitions.filter(item => item.facilityId === session.facilityId).slice(0, 6);
  const alerts = state.alerts.filter(item => item.facilityId === session.facilityId && !item.resolvedAt).slice(0, 5);

  const groupRows = BLOOD_TYPES.map(type => {
    const count = stock.filter(unit => unit.bloodType === type).length;
    const isCritical = count <= 2;
    const isLow = count <= LOW_STOCK_THRESHOLD;
    const pct = Math.min(100, Math.round((count / 15) * 100));
    const statusType = isCritical ? 'critical' : isLow ? 'low' : 'safe';
    const hasOpenReq = state.requisitions.some(req => req.facilityId === session.facilityId && req.bloodType === type && !['rejected', 'fulfilled'].includes(req.status));

    return `
      <tr>
        <td>${bloodBadge(type)}</td>
        <td class="qty">${count} units</td>
        <td>
          <div class="stock-bar-wrap">
            <div class="stock-bar-track">
              <div class="stock-bar-fill ${statusType}" style="width: ${pct}%;"></div>
            </div>
            <span style="font-size: 11px; font-weight: 700; min-width: 32px;">${count}/15</span>
          </div>
        </td>
        <td>
          ${isCritical ? '<span class="pill bad pulse-emergency">Critical Low</span>' : isLow ? '<span class="pill warn pulse-warning">Low Stock</span>' : '<span class="pill good">Optimal</span>'}
        </td>
        <td>
          ${hasOpenReq ? '<span class="pill info">Request In-Flight</span>' : `<button class="btn btn-reorder" data-action="quick-reorder" data-blood-type="${type}">⚡ Reorder ${type}</button>`}
        </td>
      </tr>
    `;
  }).join('');

  return `
    ${heading('Hospital Operations', 'Local Stock Dashboard', `${escapeHtml(facility?.name || 'Hospital')} · Regional Blood Bank & Emergency Visibility`, `
      <button class="btn btn-secondary" data-page="scan">⚡ Quick Scan Station</button>
      <button class="btn btn-primary" data-action="open-request">＋ New Requisition</button>
    `)}

    ${alerts.length > 0 ? `
      <div class="alert-banner warning">
        <div style="display:flex; align-items:center; gap:10px;">
          <span style="font-size:20px;">⚠️</span>
          <div>
            <strong>Attention: ${alerts.length} active alerts require facility review</strong>
            <div style="font-size:12px; margin-top:2px;">Blood units expiring within 7 days or stock falling below safe clinical thresholds.</div>
          </div>
        </div>
        <button class="btn btn-secondary btn-small" data-page="alerts">View All Alerts →</button>
      </div>
    ` : ''}

    <section class="metrics">
      ${metric('Available Safe Units', stock.length, 'Verified screened stock', '')}
      ${metric('Groups Below Reorder Point', BLOOD_TYPES.filter(type => stock.filter(unit => unit.bloodType === type).length <= LOW_STOCK_THRESHOLD).length, `Reorder threshold: <strong>${LOW_STOCK_THRESHOLD} units</strong>`, 'warning')}
      ${metric('Expiring Within 7 Days', expiring.length, 'Prioritize FIFO issue protocol', expiring.length ? 'warning' : '')}
      ${metric('Active Facility Alerts', alerts.length, 'Stock breach & expiry notices', alerts.length ? 'danger' : '')}
    </section>

    <div class="columns">
      ${panel('Stock by Blood Group', 'Live inventory levels vs safety thresholds', `
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Group</th>
                <th>Units</th>
                <th>Capacity Gauge</th>
                <th>Status</th>
                <th>Supply Action</th>
              </tr>
            </thead>
            <tbody>
              ${groupRows}
            </tbody>
          </table>
        </div>
      `, `<button class="link-btn" data-page="inventory">Full inventory list →</button>`)}

      ${panel('Open Requisitions', 'Approval and fulfillment status', renderRequests(requests, state, session, false), `<button class="link-btn" data-page="requisitions">Manage requisitions →</button>`)}
    </div>

    ${panel('Priority Alerts & Expiry Warnings', 'Immediate items requiring technician or officer attention', renderAlerts(alerts, state), `<button class="link-btn" data-page="alerts">Alert inbox →</button>`)}
  `;
}

// -----------------------------------------------------------------------
// 2. Inventory Page
// -----------------------------------------------------------------------
function inventoryPage(state, session, query, filterBlood = 'all', filterStatus = 'all') {
  const facility = state.facilities.find(item => item.id === session.facilityId);
  const scope = state.units.filter(unit => unit.facilityId === session.facilityId);

  let filtered = scope.filter(unit => {
    const matchesQuery = !query || `${unit.barcode} ${unit.bloodType} ${unit.status} ${unit.component}`.toLowerCase().includes(query.toLowerCase());
    const matchesBlood = filterBlood === 'all' || unit.bloodType === filterBlood;
    const matchesStatus =
      filterStatus === 'all' ? true :
      filterStatus === 'in_stock' ? unit.status === 'in_stock' && unit.expiryDate > today() :
      filterStatus === 'expiring' ? unit.status === 'in_stock' && daysUntil(unit.expiryDate) <= 7 && daysUntil(unit.expiryDate) >= 0 :
      filterStatus === 'quarantined' ? unit.status === 'quarantined' || unit.viralTestStatus !== 'negative' :
      filterStatus === 'expired' ? unit.status === 'expired' || unit.expiryDate <= today() : true;

    return matchesQuery && matchesBlood && matchesStatus;
  });

  const bloodChips = ['all', ...BLOOD_TYPES].map(type => `
    <button type="button" class="chip ${filterBlood === type ? 'active' : ''}" data-filter-blood="${type}">
      ${type === 'all' ? 'All Groups' : type}
    </button>
  `).join('');

  return `
    ${heading('Inventory Oversight', 'Blood Unit Inventory', 'Unit-level IST-128 tracking, viral screening verification, and cold-chain disposition', `
      <button class="btn btn-secondary btn-small" data-action="export-inventory">${ICONS.download} Export CSV</button>
      <button class="btn btn-primary btn-small" data-page="scan">＋ Scan New Unit</button>
    `)}

    <section class="panel">
      <div class="panel-head">
        <div>
          <div class="panel-title">${escapeHtml(facility?.name || 'Facility')} Stock</div>
          <div class="panel-note">Showing ${filtered.length} of ${scope.length} total units</div>
        </div>
        <div class="toolbar">
          <input class="search" id="inventory-search" type="search" value="${escapeHtml(query)}" placeholder="Search barcode, group, status..." aria-label="Search inventory">
          <select class="select" id="inventory-status-filter" data-action="change-status-filter">
            <option value="all" ${filterStatus === 'all' ? 'selected' : ''}>All Statuses</option>
            <option value="in_stock" ${filterStatus === 'in_stock' ? 'selected' : ''}>Safe in Stock</option>
            <option value="expiring" ${filterStatus === 'expiring' ? 'selected' : ''}>Expiring Soon (≤7d)</option>
            <option value="quarantined" ${filterStatus === 'quarantined' ? 'selected' : ''}>Quarantined</option>
            <option value="expired" ${filterStatus === 'expired' ? 'selected' : ''}>Expired / Inactive</option>
          </select>
        </div>
      </div>

      <div class="filter-row">
        <span class="filter-label">Blood Group:</span>
        ${bloodChips}
      </div>

      ${renderStockTable(filtered, state.facilities, session.role === 'hospital_officer')}
    </section>
  `;
}

// -----------------------------------------------------------------------
// 3. Scan Station Page
// -----------------------------------------------------------------------
function scanPage(state, session) {
  const groups = BLOOD_TYPES.map(type => `<option value="${type}">${type}</option>`).join('');
  const facilityUnits = state.units.filter(u => u.facilityId === session.facilityId && u.status === 'in_stock');
  const sampleBarcodes = facilityUnits.slice(0, 4);

  return `
    ${heading('Hospital Scan Station', 'IST-128 Barcode Intake & Dispensing', 'Direct keyboard/hardware scanner interface for inventory receipt, patient dispensing, or discarding.')}

    <div class="split-forms">
      <!-- Intake Form Panel -->
      <section class="panel">
        <div class="panel-head">
          <div>
            <div class="panel-title">Barcode Unit Intake</div>
            <div class="panel-note">Register a tested, screened unit into facility inventory</div>
          </div>
          <button type="button" class="btn btn-secondary btn-small" data-action="generate-barcode">${ICONS.sparkles} Auto-Fill Sample</button>
        </div>

        <form id="intake-form" class="panel-body">
          <div class="scan-box">
            <div class="scan-laser"></div>
            <div class="barcode-sim"></div>
          </div>

          <div class="scan-mark">
            <span class="scan-dot"></span>
            <span>Scanner ready · Focus barcode field or click <em>Auto-Fill Sample</em></span>
          </div>

          <div class="form-grid">
            <div class="field full">
              <label for="intake-barcode">IST-128 Barcode</label>
              <input id="intake-barcode" name="barcode" placeholder="Scan barcode or type IST128-..." required autocomplete="off">
            </div>

            <div class="field">
              <label for="intake-type">Blood Group</label>
              <select id="intake-type" name="bloodType">${groups}</select>
            </div>

            <div class="field">
              <label for="intake-component">Component</label>
              <select id="intake-component" name="component">
                <option value="Whole blood">Whole blood</option>
                <option value="Red blood cells">Red blood cells</option>
                <option value="Platelets">Platelets</option>
                <option value="Plasma">Plasma</option>
              </select>
            </div>

            <div class="field">
              <label for="intake-collected">Collection Date</label>
              <input id="intake-collected" name="collectionDate" type="date" value="${today()}" required>
            </div>

            <div class="field">
              <label for="intake-expiry">Expiry Date</label>
              <input id="intake-expiry" name="expiryDate" type="date" required>
            </div>

            <div class="field full">
              <label for="intake-viral">Viral Screening Result</label>
              <select id="intake-viral" name="viralTestStatus">
                <option value="negative">Negative / Cleared for transfusion</option>
                <option value="pending">Pending laboratory confirmation</option>
                <option value="positive">Positive / Quarantine immediately</option>
              </select>
            </div>
          </div>

          <div class="form-error" id="intake-error" role="alert"></div>

          <div class="form-actions">
            <button class="btn btn-primary" type="submit">＋ Receive Unit into Stock</button>
          </div>
        </form>
      </section>

      <!-- Dispense / Expire Movement Panel -->
      <section class="panel">
        <div class="panel-head">
          <div>
            <div class="panel-title">Dispense or Expire</div>
            <div class="panel-note">Record patient issue or disposal of expired blood</div>
          </div>
        </div>

        <form id="movement-form" class="panel-body">
          <div class="scan-box" style="background: linear-gradient(180deg, #1e293b 0%, #0f172a 100%);">
            <div class="scan-laser" style="background:#3b82f6; box-shadow:0 0 12px #3b82f6;"></div>
            <div class="barcode-sim"></div>
          </div>

          <div class="scan-mark">
            <span class="scan-dot" style="background:#3b82f6;"></span>
            <span>Scan barcode of an in-stock unit held at this facility</span>
          </div>

          ${sampleBarcodes.length > 0 ? `
            <div style="margin-bottom:12px;">
              <span class="filter-label">Quick-Pick In-Stock Unit:</span>
              <div class="quick-scan-chips">
                ${sampleBarcodes.map(u => `
                  <button type="button" class="chip" data-action="select-stock-barcode" data-barcode="${escapeHtml(u.barcode)}">
                    ${escapeHtml(u.barcode)} (${escapeHtml(u.bloodType)})
                  </button>
                `).join('')}
              </div>
            </div>
          ` : ''}

          <div class="form-grid">
            <div class="field full">
              <label for="movement-barcode">IST-128 Barcode</label>
              <input id="movement-barcode" name="barcode" placeholder="Scan unit barcode to dispense" required autocomplete="off">
            </div>

            <div class="field full">
              <label for="movement-type">Movement Action</label>
              <select id="movement-type" name="eventType">
                <option value="dispense">Dispense to patient (Ward / Surgery)</option>
                <option value="expire">Mark expired / Discard unit</option>
              </select>
            </div>
          </div>

          <div class="form-error" id="movement-error" role="alert"></div>

          <div class="form-actions">
            <button class="btn btn-primary" type="submit">Record Unit Movement</button>
          </div>
        </form>
      </section>
    </div>
  `;
}

// -----------------------------------------------------------------------
// 4. Requisitions Page
// -----------------------------------------------------------------------
function requestsPage(state, session, filterTab = 'all') {
  let requests = state.requisitions;
  if (session.role === 'hospital_officer') requests = requests.filter(item => item.facilityId === session.facilityId);
  if (session.role === 'clinician') requests = requests.filter(item => item.staffId === session.staffId);
  if (session.role === 'hub_staff') requests = requests.filter(item => ['awaiting_hub_review', 'approved', 'dispatched'].includes(item.status));

  // Tab filtering
  let filteredRequests = requests;
  if (filterTab === 'pending') {
    filteredRequests = requests.filter(r => ['awaiting_facility_review', 'awaiting_hub_review'].includes(r.status));
  } else if (filterTab === 'in_transit') {
    filteredRequests = requests.filter(r => ['approved', 'dispatched'].includes(r.status));
  } else if (filterTab === 'fulfilled') {
    filteredRequests = requests.filter(r => ['fulfilled', 'received'].includes(r.status));
  }

  const action = session.role === 'clinician' || session.role === 'hospital_officer'
    ? `<button class="btn btn-primary" data-action="open-request">＋ Submit New Requisition</button>`
    : '';

  const subtitle = session.role === 'hub_staff'
    ? 'Requests awaiting regional hub approval, unit allocation, or dispatch.'
    : session.role === 'clinician'
    ? 'Blood requisitions initiated under your clinician account.'
    : 'Hospital-level clinical requests and incoming hub transfer orders.';

  return `
    ${heading('Blood Supply Workflow', session.role === 'hub_staff' ? 'Hub Requisition Queue' : 'Requisition Orders', subtitle, action)}

    <section class="panel">
      <div class="panel-head">
        <div>
          <div class="panel-title">${session.role === 'hub_staff' ? 'Hub Approval Queue' : 'Requisition Orders'}</div>
          <div class="panel-note">${filteredRequests.length} matching requests found</div>
        </div>
      </div>

      <div class="filter-row">
        <span class="filter-label">Filter Queue:</span>
        <button type="button" class="chip ${filterTab === 'all' ? 'active' : ''}" data-filter-tab="all">All (${requests.length})</button>
        <button type="button" class="chip ${filterTab === 'pending' ? 'active' : ''}" data-filter-tab="pending">Awaiting Review (${requests.filter(r => ['awaiting_facility_review', 'awaiting_hub_review'].includes(r.status)).length})</button>
        <button type="button" class="chip ${filterTab === 'in_transit' ? 'active' : ''}" data-filter-tab="in_transit">In Transit / Dispatched (${requests.filter(r => ['approved', 'dispatched'].includes(r.status)).length})</button>
        <button type="button" class="chip ${filterTab === 'fulfilled' ? 'active' : ''}" data-filter-tab="fulfilled">Fulfilled (${requests.filter(r => ['fulfilled', 'received'].includes(r.status)).length})</button>
      </div>

      ${renderRequests(filteredRequests, state, session, true)}
    </section>
  `;
}

// -----------------------------------------------------------------------
// 5. Cross-Facility Availability Page
// -----------------------------------------------------------------------
function availabilityPage(state, query, filterDistrict = 'all') {
  const verifiedHospitals = state.facilities.filter(item => item.type === 'Hospital' && item.verified);
  const districts = ['all', ...new Set(verifiedHospitals.map(h => h.district))];

  const rows = [];
  for (const facility of verifiedHospitals) {
    if (filterDistrict !== 'all' && facility.district !== filterDistrict) continue;

    const counts = Object.fromEntries(
      BLOOD_TYPES.map(type => [
        type,
        state.units.filter(unit => unit.facilityId === facility.id && unit.bloodType === type && unit.status === 'in_stock' && unit.expiryDate > today() && unit.viralTestStatus === 'negative').length
      ])
    );

    if (query && !`${facility.name} ${facility.district}`.toLowerCase().includes(query.toLowerCase()) && !BLOOD_TYPES.some(type => `${type} ${counts[type]}`.toLowerCase().includes(query.toLowerCase()))) {
      continue;
    }

    const bloodCells = BLOOD_TYPES.map(type => {
      const c = counts[type];
      const color = c >= 7 ? '#059669' : c > 0 ? '#d97706' : '#94a3b8';
      const bg = c >= 7 ? '#ecfdf5' : c > 0 ? '#fffbeb' : '#f8fafc';
      return `
        <td style="text-align:center;">
          <span style="display:inline-block; min-width:28px; padding:3px 6px; border-radius:4px; font-weight:700; color:${color}; background:${bg};">
            ${c}
          </span>
        </td>
      `;
    }).join('');

    rows.push(`
      <tr>
        <td>
          <strong>${escapeHtml(facility.name)}</strong>
          <div style="font-size:11px; color:var(--muted);">${escapeHtml(facility.id)}</div>
        </td>
        <td><span class="pill info">${escapeHtml(facility.district)}</span></td>
        ${bloodCells}
        <td>
          <button class="btn btn-secondary btn-small" data-action="open-request" title="Request blood from network">＋ Request</button>
        </td>
      </tr>
    `);
  }

  const districtChips = districts.map(d => `
    <button type="button" class="chip ${filterDistrict === d ? 'active' : ''}" data-filter-district="${d}">
      ${d === 'all' ? 'All Districts' : d}
    </button>
  `).join('');

  return `
    ${heading('Network Supply Matrix', 'Cross-Facility Blood Availability', 'Search verified hospital stock in real time. Only screened, in-stock, and unexpired units are reflected.')}

    <section class="panel">
      <div class="panel-head">
        <div>
          <div class="panel-title">Regional Hospital Stock Grid</div>
          <div class="panel-note">${verifiedHospitals.length} verified hospitals participating in network sharing</div>
        </div>
        <input class="search" id="availability-search" type="search" value="${escapeHtml(query)}" placeholder="Search hospital name, district, blood group..." aria-label="Search facility availability">
      </div>

      <div class="filter-row">
        <span class="filter-label">Filter District:</span>
        ${districtChips}
      </div>

      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Hospital Facility</th>
              <th>District</th>
              ${BLOOD_TYPES.map(type => `<th style="text-align:center;">${type}</th>`).join('')}
              <th>Order</th>
            </tr>
          </thead>
          <tbody>
            ${rows.join('') || '<tr><td colspan="12" class="empty">No verified facility matches this filter or search query.</td></tr>'}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

// -----------------------------------------------------------------------
// 6. Regional Hub Dashboard
// -----------------------------------------------------------------------
function hubPage(state, session) {
  const facility = state.facilities.find(item => item.id === session.facilityId);
  const units = state.units.filter(item => item.facilityId === session.facilityId && item.status === 'in_stock' && item.expiryDate > today());
  const pending = state.requisitions.filter(item => item.status === 'awaiting_hub_review').length;
  const expiringCount = units.filter(item => item.expiryDate <= new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)).length;

  const types = BLOOD_TYPES.map(type => {
    const total = units.filter(item => item.bloodType === type).length;
    const cleared = units.filter(item => item.bloodType === type && item.viralTestStatus === 'negative').length;
    const exp = units.filter(item => item.bloodType === type && item.expiryDate <= new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)).length;
    return `
      <tr>
        <td>${bloodBadge(type)}</td>
        <td class="qty">${total}</td>
        <td><span class="pill good">${cleared} cleared</span></td>
        <td>${exp > 0 ? `<span class="pill warn">${exp} exp ≤7d</span>` : '<span class="pill info">0</span>'}</td>
      </tr>
    `;
  }).join('');

  return `
    ${heading('UBTS Regional Operations', 'Regional Hub Dashboard', `${escapeHtml(facility?.name || 'Central UBTS Hub')} · Regional Supply Allocation & Requisition Fulfillment`, `
      <button class="btn btn-secondary" data-page="requests">Review Approval Queue →</button>
    `)}

    <section class="metrics">
      ${metric('Total Hub Stock', units.length, 'Screened unexpired units held at hub')}
      ${metric('Awaiting Hub Review', pending, 'Pending facility orders', pending ? 'warning' : '')}
      ${metric('Hospitals Served', state.facilities.filter(item => item.hubId === facility?.id && item.verified).length, 'Verified linked facilities')}
      ${metric('Network Stock Alerts', state.alerts.filter(item => !item.resolvedAt).length, 'Regional low-stock & expiry notices', 'danger')}
    </section>

    <div class="columns">
      ${panel('Hub Screened Stock by Blood Group', 'Units cleared for regional emergency dispatch', `
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Group</th>
                <th>In Stock</th>
                <th>Viral Cleared</th>
                <th>Expiring in 7 Days</th>
              </tr>
            </thead>
            <tbody>
              ${types}
            </tbody>
          </table>
        </div>
      `, `<button class="link-btn" data-page="inventory">Hub inventory →</button>`)}

      ${panel('Awaiting Hub Decision', 'Highest priority hospital requisitions', renderRequests(state.requisitions.filter(item => item.status === 'awaiting_hub_review').slice(0, 5), state, session, true), `<button class="link-btn" data-page="requests">Full queue →</button>`)}
    </div>
  `;
}

// -----------------------------------------------------------------------
// 7. Alerts Page
// -----------------------------------------------------------------------
function alertsPage(state, session) {
  const alerts = state.alerts.filter(item => session.role === 'hub_staff' || item.facilityId === session.facilityId);
  const activeAlerts = alerts.filter(item => !item.resolvedAt);

  return `
    ${heading('Supply Notifications', 'Stock & Expiry Alert Center', 'Continuous threshold evaluation engine alerting on stock depletions and shelf-life expirations.')}

    ${panel('Active Notifications Inbox', `${activeAlerts.length} active · ${alerts.length} total historical alerts`, renderAlerts(alerts, state))}

    <div class="notice">
      <strong>Automated Gateway Status:</strong>
      <span>SMS and Push notifications are broadcasted locally to the event bus. Outbox logs are preserved for clinical compliance.</span>
    </div>
  `;
}

// -----------------------------------------------------------------------
// 8. Reports & Analytics Page
// -----------------------------------------------------------------------
function reportsPage(state, session, reports) {
  const scope = session.role === 'hub_staff' ? null : session.facilityId;
  const totals = reports.snapshot(scope);
  const events = reports.audit(scope);

  // Group breakdown for CSS chart
  const relevantUnits = state.units.filter(u => (!scope || u.facilityId === scope) && u.status === 'in_stock' && u.expiryDate > today());
  const maxUnits = Math.max(...BLOOD_TYPES.map(t => relevantUnits.filter(u => u.bloodType === t).length), 1);

  const chartRows = BLOOD_TYPES.map(type => {
    const count = relevantUnits.filter(u => u.bloodType === type).length;
    const pct = Math.round((count / maxUnits) * 100);
    return `
      <div class="chart-bar-row">
        <div>${bloodBadge(type)}</div>
        <div class="chart-bar-bg">
          <div class="chart-bar-fill ${count <= LOW_STOCK_THRESHOLD ? 'red' : ''}" style="width: ${pct}%;"></div>
        </div>
        <div style="font-weight:700; font-size:12.5px; text-align:right;">${count} units</div>
      </div>
    `;
  }).join('');

  return `
    ${heading('Supply Intelligence', 'Reports & Audit Oversight', 'Inventory summaries, blood group distribution analytics, and immutable scan audit trail.', `
      <button class="btn btn-secondary btn-small" data-action="export-inventory">${ICONS.download} Export Inventory CSV</button>
    `)}

    <section class="metrics">
      ${metric('Available Safe Stock', totals.totalUnits, 'In-stock unexpired units')}
      ${metric('Expiring Within 7 Days', totals.expiring, 'Immediate distribution target', totals.expiring ? 'warning' : '')}
      ${metric('Expired / Decommissioned', totals.expired, 'Units discarded or expired', 'danger')}
      ${metric('Requisition Orders', totals.requests, 'Supply orders tracked')}
    </section>

    <div class="columns">
      ${panel('Blood Group Stock Distribution', 'Visual proportion of in-stock blood units', `
        <div class="chart-container">
          ${chartRows}
        </div>
      `)}

      ${panel('Recent Traceability Events', `${totals.events} recorded movements in this facility`, renderEvents(events))}
    </div>
  `;
}

// -----------------------------------------------------------------------
// 9. Facility Verification Page (Admin)
// -----------------------------------------------------------------------
function facilitiesPage(state) {
  const cards = state.facilities.map(facility => {
    const staff = state.staff.filter(item => item.facilityId === facility.id);
    return `
      <details class="facility-card" data-facility-id="${escapeHtml(facility.id)}">
        <summary class="facility-summary">
          <div>
            <div class="facility-summary-name">${escapeHtml(facility.name)}</div>
            <div class="facility-meta-line">${escapeHtml(facility.type)} · District: ${escapeHtml(facility.district)} · Code: ${escapeHtml(facility.id)}</div>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            ${pill(facility.verified ? 'in_stock' : 'rejected', facility.verified ? 'Verified' : 'Pending')}
            <span class="facility-chevron">⌄</span>
          </div>
        </summary>
        <div class="facility-people">
          <div class="request-list">
            ${staff.map(person => `
              <div class="request-item">
                <div>
                  <div class="request-name">${escapeHtml(person.name)}</div>
                  <div class="request-meta">${escapeHtml(ROLES[person.role] || person.role)} · ID: ${escapeHtml(person.id)}</div>
                </div>
                ${button('verify-staff', person.verified ? '✓ Verified' : 'Verify Staff', person.verified ? 'secondary' : 'primary', `data-id="${escapeHtml(person.id)}" data-verified="${!person.verified}"`)}
              </div>
            `).join('')}
          </div>
          <div class="form-actions" style="margin-top:14px;">
            ${button('verify-facility', facility.verified ? 'Suspend Facility' : 'Verify Facility Access', facility.verified ? 'danger' : 'primary', `data-id="${escapeHtml(facility.id)}" data-verified="${!facility.verified}"`)}
          </div>
        </div>
      </details>
    `;
  }).join('');

  return `
    ${heading('System Administration', 'Facility & Staff Verification', 'Manage hospital accreditations and clinician authorizations across the UBTS-Link network.')}
    ${panel('Registered Facilities & Authorized Staff', 'Accreditation controls dynamically govern requisition routing and barcode issuance', `<div class="facility-card-grid">${cards}</div>`)}
  `;
}

// -----------------------------------------------------------------------
// 10. Audit Trail Page (Admin)
// -----------------------------------------------------------------------
function auditPage(state, reports) {
  const events = reports.audit(null);
  return `
    ${heading('System Administration', 'Cross-Facility Audit Log', 'Comprehensive tamper-evident scan movement trail across all regional hospitals and hubs.', `
      <button class="btn btn-secondary btn-small" data-action="export-inventory">${ICONS.download} Export Trail CSV</button>
    `)}
    ${panel('All Network Events', `${events.length} immutable events recorded`, renderEvents(events))}
  `;
}

// -----------------------------------------------------------------------
// Main Application Shell
// -----------------------------------------------------------------------
export function renderApplication({ state, session, page, query, filterBlood, filterStatus, filterTab, filterDistrict, reports }) {
  const pageAllowed = NAVIGATION[session.role].some(item => item[0] === page);
  const activePage = pageAllowed ? page : NAVIGATION[session.role][0][0];
  const currentFacility = state.facilities.find(item => item.id === session.facilityId);
  const currentStaff = state.staff.find(item => item.id === session.staffId);

  // Dynamic Badge Counters
  const activeAlertsCount = state.alerts.filter(a => !a.resolvedAt && (session.role === 'hub_staff' || a.facilityId === session.facilityId)).length;
  const pendingRequestsCount = state.requisitions.filter(r =>
    (session.role === 'hub_staff' && r.status === 'awaiting_hub_review') ||
    (session.role === 'hospital_officer' && r.facilityId === session.facilityId && r.status === 'awaiting_facility_review')
  ).length;

  const pages = {
    overview: () => overviewPage(state, session),
    inventory: () => inventoryPage(state, session, query, filterBlood, filterStatus),
    scan: () => scanPage(state, session),
    requisitions: () => requestsPage(state, session, filterTab),
    requests: () => requestsPage(state, session, filterTab),
    availability: () => availabilityPage(state, query, filterDistrict),
    hub: () => hubPage(state, session),
    alerts: () => alertsPage(state, session),
    reports: () => reportsPage(state, session, reports),
    facilities: () => facilitiesPage(state),
    audit: () => auditPage(state, reports)
  };

  const date = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date());

  const links = NAVIGATION[session.role].map(([id, legacyIcon, label]) => {
    const iconSvg = ICONS[id] || ICONS.overview;
    let badgeHtml = '';
    if (id === 'alerts' && activeAlertsCount > 0) {
      badgeHtml = `<span class="nav-badge alert">${activeAlertsCount}</span>`;
    } else if ((id === 'requisitions' || id === 'requests') && pendingRequestsCount > 0) {
      badgeHtml = `<span class="nav-badge pending">${pendingRequestsCount}</span>`;
    }

    return `
      <button type="button" data-page="${id}" class="${activePage === id ? 'active' : ''}">
        <span class="nav-ico" aria-hidden="true">${iconSvg}</span>
        <span class="nav-text">${label}</span>
        ${badgeHtml}
      </button>
    `;
  }).join('');

  return `
    <div class="shell">
      <!-- Sidebar Rail -->
      <aside class="rail">
        <div class="brand">
          <div class="brand-mark" aria-hidden="true">
            ${ICONS.logo}
          </div>
          <div class="brand-text">
            <div class="brand-name">UBTS-Link</div>
            <div class="brand-caption">Uganda Blood Services</div>
          </div>
        </div>

        <div class="rail-label">
          ${session.role === 'hub_staff' || session.role === 'system_admin' ? 'Regional Hub Workspace' : 'Hospital Clinical Portal'}
        </div>

        <nav class="nav-list" aria-label="Main Navigation">
          ${links}
        </nav>

        <div class="rail-foot">
          <div class="facility-block">
            <div class="facility-kicker">Current Facility</div>
            <div class="facility-title">${escapeHtml(currentFacility?.name || '—')}</div>
            <div class="facility-detail">${escapeHtml(currentFacility?.district || '')} · ${escapeHtml(currentFacility?.type || 'Hospital')}</div>
          </div>

          <div class="identity">
            <div class="avatar">
              ${escapeHtml((currentStaff?.name || 'U').split(' ').map(part => part[0]).slice(0, 2).join(''))}
            </div>
            <div class="identity-info">
              <div class="identity-name">${escapeHtml(currentStaff?.name || 'User')}</div>
              <div class="identity-role">${escapeHtml(ROLES[session.role])}</div>
            </div>
          </div>
        </div>
      </aside>

      <!-- Main Section -->
      <main class="main">
        <header class="topbar">
          <div class="crumb">
            <span>UBTS-Link</span>
            <span style="color:var(--slate-400);">${ICONS.chevronRight}</span>
            <strong>${escapeHtml(PAGE_TITLES[activePage])}</strong>
          </div>

          <div class="top-right">
            <div class="live-indicator">
              <span class="live-dot"></span>
              <span>Live System · ${date} EAT</span>
            </div>

            <button type="button" class="btn btn-secondary btn-small" data-action="reset-demo" title="Reset all demo data back to initial seed">
              ↺ Reset Demo
            </button>

            <select class="role-picker" id="role-picker" aria-label="Switch demonstration user role">
              ${Object.entries(ROLES).map(([role, label]) => `
                <option value="${role}" ${session.role === role ? 'selected' : ''}>Demo Role: ${label}</option>
              `).join('')}
            </select>
          </div>
        </header>

        <div class="content">
          ${pages[activePage]()}

          <div class="notice">
            <div style="font-size:18px;">💡</div>
            <div>
              <strong>Demonstration Prototype Mode:</strong>
              <span>Browser-local state active with instant tab synchronization. Compatible with barcode scanners, IST-128 standard identifiers, and emergency replenishment workflows.</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  `;
}

// -----------------------------------------------------------------------
// Modals & Dialogs
// -----------------------------------------------------------------------
export function renderDialog(title, description, body) {
  return `
    <div class="dialog-backdrop" data-action="close-dialog">
      <section class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
        <header class="dialog-head">
          <div>
            <h2 id="dialog-title">${title}</h2>
            <p>${description}</p>
          </div>
          <button type="button" class="close" data-action="close-dialog" aria-label="Close dialog">×</button>
        </header>
        ${body}
      </section>
    </div>
  `;
}

export function requestDialog(prefilledBloodType = 'O-') {
  return renderDialog(
    'Submit Blood Requisition',
    'Automated replenishment request routed to clinical facility review and regional UBTS hub.',
    `
      <form id="request-form" class="dialog-body">
        <div class="form-grid">
          <div class="field">
            <label for="request-group">Blood Group</label>
            <select id="request-group" name="bloodType">
              ${BLOOD_TYPES.map(type => `
                <option value="${type}" ${type === prefilledBloodType ? 'selected' : ''}>${type} ${type === 'O-' ? '(Universal Donor)' : type === 'AB+' ? '(Universal Recipient)' : ''}</option>
              `).join('')}
            </select>
          </div>

          <div class="field">
            <label for="request-quantity">Units Requested</label>
            <input id="request-quantity" name="unitsRequested" type="number" min="1" max="100" value="4" required>
          </div>

          <div class="field full">
            <label for="request-urgency">Clinical Urgency Level</label>
            <select id="request-urgency" name="urgency">
              <option value="routine">Routine (Scheduled surgery or elective stock replenishment)</option>
              <option value="urgent">Urgent (Ward depletion / within 4 hours)</option>
              <option value="emergency">Emergency / Trauma (Immediate priority dispatch)</option>
            </select>
          </div>
        </div>

        <div class="form-error" id="request-error" role="alert"></div>

        <div class="form-actions">
          <button type="button" class="btn btn-secondary" data-action="close-dialog">Cancel</button>
          <button type="submit" class="btn btn-primary">Submit Blood Requisition</button>
        </div>
      </form>
    `
  );
}

export function unitInspectDialog(unit, facility) {
  const days = daysUntil(unit.expiryDate);
  return renderDialog(
    `Unit Details: ${escapeHtml(unit.barcode)}`,
    `Complete IST-128 lifecycle and cold-chain compliance record`,
    `
      <div class="dialog-body">
        <div class="scan-box" style="margin-bottom:16px;">
          <div class="barcode-sim"></div>
          <div style="color:#ffffff; font-family:monospace; font-size:12px; margin-top:8px; text-align:center;">
            ${escapeHtml(unit.barcode)}
          </div>
        </div>

        <div class="unit-spec-grid">
          <div class="unit-spec-card">
            <div class="unit-spec-label">Blood Group</div>
            <div class="unit-spec-value">${bloodBadge(unit.bloodType)}</div>
          </div>

          <div class="unit-spec-card">
            <div class="unit-spec-label">Component</div>
            <div class="unit-spec-value">${escapeHtml(unit.component)}</div>
          </div>

          <div class="unit-spec-card">
            <div class="unit-spec-label">Current Location</div>
            <div class="unit-spec-value">${escapeHtml(facility?.name || 'Unknown')}</div>
          </div>

          <div class="unit-spec-card">
            <div class="unit-spec-label">Shelf Life Remaining</div>
            <div class="unit-spec-value">${days < 0 ? '<span class="pill bad">Expired</span>' : `${days} days left`}</div>
          </div>

          <div class="unit-spec-card">
            <div class="unit-spec-label">Viral Screening</div>
            <div class="unit-spec-value">${pill(unit.viralTestStatus === 'negative' ? 'in_stock' : 'bad', unit.viralTestStatus)}</div>
          </div>

          <div class="unit-spec-card">
            <div class="unit-spec-label">Inventory Status</div>
            <div class="unit-spec-value">${pill(unit.status)}</div>
          </div>
        </div>

        <div class="form-actions" style="margin-top:20px;">
          <button type="button" class="btn btn-secondary" data-action="close-dialog">Close</button>
          ${unit.status === 'in_stock' ? `<button type="button" class="btn btn-primary" data-action="prefill-dispense" data-barcode="${escapeHtml(unit.barcode)}">Dispense Unit</button>` : ''}
        </div>
      </div>
    `
  );
}
