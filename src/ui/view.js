import { BLOOD_TYPES, NAVIGATION, PAGE_TITLES, ROLES, formatDate, formatDateTime, today } from '../domain/constants.js';

const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const statusLabel=status=>({in_stock:'In stock',in_transit:'In transit',dispensed:'Dispensed',expired:'Expired',awaiting_facility_review:'Facility review',awaiting_hub_review:'Hub review',approved:'Approved',rejected:'Rejected',dispatched:'Dispatched',fulfilled:'Fulfilled'}[status]||status);
const statusClass=status=>['in_stock','approved','fulfilled','received'].includes(status)?'good':['rejected','expired'].includes(status)?'bad':['awaiting_facility_review','awaiting_hub_review'].includes(status)?'warn':'info';
const pill=(status,label=statusLabel(status))=>`<span class="pill ${statusClass(status)}">${escapeHtml(label)}</span>`;
const button=(action,label,kind='secondary',data='')=>`<button class="btn btn-${kind} btn-small" data-action="${action}" ${data}>${label}</button>`;
const heading=(eyebrow,title,description,actions='')=>`<header class="page-head"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p>${description}</p></div>${actions?`<div class="actions">${actions}</div>`:''}</header>`;
const panel=(title,note,body,action='')=>`<section class="panel"><div class="panel-head"><div><div class="panel-title">${title}</div><div class="panel-note">${note}</div></div>${action}</div>${body}</section>`;

function renderStockTable(units,facilities,actions=false) {
  const rows=units.slice(0,120).map(unit=>`<tr><td><strong>${escapeHtml(unit.barcode)}</strong></td><td><span class="blood">${escapeHtml(unit.bloodType)}</span></td><td>${escapeHtml(unit.component)}</td><td>${escapeHtml(facilities.find(item=>item.id===unit.facilityId)?.name||'—')}</td><td>${formatDate(unit.expiryDate)}</td><td>${escapeHtml(unit.viralTestStatus)}</td><td>${pill(unit.status)}</td>${actions?`<td>${unit.status==='in_stock'?`<button class="text-btn" data-action="prefill-dispense" data-barcode="${escapeHtml(unit.barcode)}">Dispense</button>`:'—'}</td>`:''}</tr>`).join('');
  return `<div class="table-scroll"><table><thead><tr><th>IST-128 barcode</th><th>Blood group</th><th>Component</th><th>Facility</th><th>Expiry</th><th>Viral test</th><th>Status</th>${actions?'<th>Action</th>':''}</tr></thead><tbody>${rows||`<tr><td colspan="${actions?8:7}" class="empty">No matching blood units.</td></tr>`}</tbody></table></div>`;
}

function renderRequests(requests,state,session,showActions) {
  const rows=requests.map(request=>{
    const facility=state.facilities.find(item=>item.id===request.facilityId);
    const staff=state.staff.find(item=>item.id===request.staffId);
    let actions='—';
    if (showActions&&session.role==='hospital_officer'&&request.status==='awaiting_facility_review') actions=`${button('facility-approve','Approve','primary',`data-id="${escapeHtml(request.id)}"`)} ${button('facility-reject','Reject','danger',`data-id="${escapeHtml(request.id)}"`)}`;
    if (showActions&&session.role==='hub_staff'&&request.status==='awaiting_hub_review') actions=`${button('hub-approve','Approve','primary',`data-id="${escapeHtml(request.id)}"`)} ${button('hub-reject','Reject','danger',`data-id="${escapeHtml(request.id)}"`)}`;
    if (showActions&&session.role==='hub_staff'&&request.status==='approved') actions=button('dispatch','Dispatch', 'primary',`data-id="${escapeHtml(request.id)}"`);
    if (showActions&&session.role==='hospital_officer'&&request.status==='dispatched'&&request.facilityId===session.facilityId) actions=button('receive','Confirm receipt','primary',`data-id="${escapeHtml(request.id)}"`);
    return `<tr><td><strong>${escapeHtml(request.id)}</strong>${request.automated?'<div class="log-detail">Auto-generated</div>':''}</td><td>${escapeHtml(facility?.name||'—')}</td><td><span class="blood">${escapeHtml(request.bloodType)}</span></td><td class="qty">${request.unitsRequested}</td><td>${escapeHtml(request.urgency)}</td><td>${formatDateTime(request.requestTime)}</td><td>${pill(request.status)}</td><td>${escapeHtml(staff?.name||'Stock alert')}</td><td>${actions}</td></tr>`;
  }).join('');
  return `<div class="table-scroll"><table><thead><tr><th>Request</th><th>Facility</th><th>Group</th><th>Units</th><th>Urgency</th><th>Requested</th><th>Status</th><th>Requested by</th><th>Decision</th></tr></thead><tbody>${rows||'<tr><td colspan="9" class="empty">No requisitions to show.</td></tr>'}</tbody></table></div>`;
}

function renderAlerts(alerts,state) {
  const rows=alerts.filter(alert=>!alert.resolvedAt).slice(0,30).map(alert=>`<div class="alert-row"><span class="alert-dot ${alert.type==='expiry'?'expiry':''}"></span><div><div class="alert-title">${escapeHtml(alert.title)}</div><div class="alert-detail">${escapeHtml(alert.detail)} · ${escapeHtml(state.facilities.find(item=>item.id===alert.facilityId)?.name||'')}</div></div><span class="demo-label">${escapeHtml(alert.type.replace('_',' '))}</span></div>`).join('');
  return rows||'<div class="empty">No active low-stock or expiry alerts.</div>';
}

function renderEvents(events) {
  const rows=events.slice(0,30).map(event=>`<div class="log-row"><span class="log-time">${formatDateTime(event.timestamp)}</span><div><strong>${escapeHtml(event.eventType)}</strong> · ${escapeHtml(event.unit?.barcode||event.unitId)}<div class="log-detail">${escapeHtml(event.unit?.bloodType||'')} · ${escapeHtml(event.facility?.name||'')} · ${escapeHtml(event.staff?.name||'System')}</div></div>${pill(event.eventType,'Recorded')}</div>`).join('');
  return rows||'<div class="empty">No scan events recorded yet.</div>';
}

function metric(label,value,note,kind='') { return `<article class="metric ${kind}"><div class="metric-label">${label}</div><div class="metric-value">${value}</div><div class="metric-note">${note}</div></article>`; }

function overviewPage(state,session) {
  const facility=state.facilities.find(item=>item.id===session.facilityId);
  const units=state.units.filter(unit=>unit.facilityId===session.facilityId);
  const stock=units.filter(unit=>unit.status==='in_stock'&&unit.expiryDate>today());
  const expiring=stock.filter(unit=>unit.expiryDate<=new Date(Date.now()+7*86400000).toISOString().slice(0,10));
  const requests=state.requisitions.filter(item=>item.facilityId===session.facilityId).slice(0,6);
  const alerts=state.alerts.filter(item=>item.facilityId===session.facilityId&&!item.resolvedAt).slice(0,5);
  const groupRows=BLOOD_TYPES.map(type=>{
    const count=stock.filter(unit=>unit.bloodType===type).length;
    const low=count<=6;
    return `<tr><td><span class="blood">${type}</span></td><td class="qty">${count}</td><td>${pill(low?'awaiting_hub_review':'in_stock',low?'Low stock':'In range')}</td><td>${state.requisitions.some(req=>req.facilityId===session.facilityId&&req.bloodType===type&&!['rejected','fulfilled'].includes(req.status))?'Open request':'—'}</td></tr>`;
  }).join('');
  return `${heading('Hospital operations','Local stock dashboard',`${escapeHtml(facility?.name||'Hospital')} · Regional supply visibility`,`<button class="btn btn-secondary" data-page="scan">⌕ &nbsp;Scan a unit</button><button class="btn btn-primary" data-action="open-request">＋ &nbsp;New requisition</button>`)}<section class="metrics">${metric('Available units',stock.length,'Verified, unexpired stock')}${metric('Groups below reorder point',BLOOD_TYPES.filter(type=>stock.filter(unit=>unit.bloodType===type).length<=6).length,'Reorder point: <strong>6 units</strong>','warning')}${metric('Expiring within 7 days',expiring.length,'Review FIFO issue order',expiring.length?'warning':'')}${metric('Active alerts',alerts.length,'Low stock and expiry',alerts.length?'danger':'')}</section><div class="columns">${panel('Stock by blood group','Hospital-held units against reorder point',`<div class="table-scroll"><table><thead><tr><th>Group</th><th>Available</th><th>Level</th><th>Requisition</th></tr></thead><tbody>${groupRows}</tbody></table></div>`,`<button class="link-btn" data-page="inventory">Full inventory →</button>`)}${panel('Open requisitions','Approval and fulfillment status',renderRequests(requests,state,session,false),`<button class="link-btn" data-page="requisitions">View all →</button>`)}</div>${panel('Priority alerts','Active issues for this facility',renderAlerts(alerts,state),`<button class="link-btn" data-page="alerts">All alerts →</button>`)}`;
}

function inventoryPage(state,session,query) {
  const scope=session.role==='hub_staff'?state.units.filter(unit=>unit.facilityId===session.facilityId):state.units.filter(unit=>unit.facilityId===session.facilityId);
  const filtered=scope.filter(unit=>`${unit.barcode} ${unit.bloodType} ${unit.status}`.toLowerCase().includes(query.toLowerCase()));
  return `${heading('Inventory','Blood unit inventory','Unit-level barcode, viral test, facility, and expiry tracking')}<section class="panel"><div class="panel-head"><div><div class="panel-title">${escapeHtml(state.facilities.find(item=>item.id===session.facilityId)?.name||'Facility')} units</div><div class="panel-note">${filtered.length} records</div></div><input class="search" id="inventory-search" type="search" value="${escapeHtml(query)}" placeholder="Search barcode or group" aria-label="Search inventory"></div>${renderStockTable(filtered,state.facilities,session.role==='hospital_officer')}</section>`;
}

function scanPage() {
  const groups=BLOOD_TYPES.map(type=>`<option>${type}</option>`).join('');
  return `${heading('Hospital scan app','Unit intake & dispensing','Scanner input uses the IST-128 barcode value. Successful scans write a movement event.')}<div class="split-forms">${panel('Barcode intake','Register a screened unit into this facility',`<form id="intake-form" class="panel-body"><div class="scan-mark"><span class="scan-dot"></span>Scanner ready · focus the barcode field before scanning.</div><div class="form-grid"><div class="field full"><label for="intake-barcode">IST-128 barcode</label><input id="intake-barcode" name="barcode" placeholder="Scan label or type barcode" required autocomplete="off"></div><div class="field"><label for="intake-type">Blood group</label><select id="intake-type" name="bloodType">${groups}</select></div><div class="field"><label for="intake-component">Component</label><select id="intake-component" name="component"><option>Whole blood</option><option>Red blood cells</option><option>Platelets</option><option>Plasma</option></select></div><div class="field"><label for="intake-collected">Collection date</label><input id="intake-collected" name="collectionDate" type="date" value="${today()}" required></div><div class="field"><label for="intake-expiry">Expiry date</label><input id="intake-expiry" name="expiryDate" type="date" required></div><div class="field full"><label for="intake-viral">Viral test status</label><select id="intake-viral" name="viralTestStatus"><option value="negative">Negative / cleared</option><option value="pending">Pending</option><option value="positive">Positive / quarantine</option></select></div></div><div class="form-error" id="intake-error" role="alert"></div><div class="form-actions"><button class="btn btn-primary" type="submit">＋ Add unit</button></div></form>`)}${panel('Dispense or expire','Scan an in-stock unit to record its disposition',`<form id="movement-form" class="panel-body"><div class="scan-mark"><span class="scan-dot"></span>Barcode match is checked against this facility’s stock.</div><div class="form-grid"><div class="field full"><label for="movement-barcode">IST-128 barcode</label><input id="movement-barcode" name="barcode" placeholder="Scan unit barcode" required autocomplete="off"></div><div class="field full"><label for="movement-type">Movement event</label><select id="movement-type" name="eventType"><option value="dispense">Dispense to patient</option><option value="expire">Mark expired / discard</option></select></div></div><div class="form-error" id="movement-error" role="alert"></div><div class="form-actions"><button class="btn btn-secondary" type="submit">Record movement</button></div></form>`)}</div>`;
}

function requestsPage(state,session) {
  let requests=state.requisitions;
  if (session.role==='hospital_officer') requests=requests.filter(item=>item.facilityId===session.facilityId);
  if (session.role==='clinician') requests=requests.filter(item=>item.staffId===session.staffId);
  if (session.role==='hub_staff') requests=requests.filter(item=>item.status==='awaiting_hub_review'||item.status==='approved'||item.status==='dispatched');
  const action=session.role==='clinician'?`<button class="btn btn-primary" data-action="open-request">＋ &nbsp;Submit request</button>`:'';
  const subtitle=session.role==='hub_staff'?'Requests waiting for hub decision or dispatch.':session.role==='clinician'?'Requests submitted under your account.':'Review clinician requests and confirm incoming hub fulfillment.';
  return `${heading('Supply workflow',session.role==='hub_staff'?'Requisition approvals':'Requisition requests',subtitle,action)}${panel(session.role==='hub_staff'?'Hub queue':'Requests',`${requests.length} records · approval and fulfillment history`,renderRequests(requests,state,session,true))}`;
}

function availabilityPage(state,query) {
  const rows=[];
  for (const facility of state.facilities.filter(item=>item.type==='Hospital'&&item.verified)) {
    const counts=Object.fromEntries(BLOOD_TYPES.map(type=>[type,state.units.filter(unit=>unit.facilityId===facility.id&&unit.bloodType===type&&unit.status==='in_stock'&&unit.expiryDate>today()&&unit.viralTestStatus==='negative').length]));
    if (query&&!`${facility.name} ${facility.district}`.toLowerCase().includes(query.toLowerCase())&&!BLOOD_TYPES.some(type=>`${type} ${counts[type]}`.toLowerCase().includes(query.toLowerCase()))) continue;
    rows.push(`<tr><td><strong>${escapeHtml(facility.name)}</strong></td><td>${escapeHtml(facility.district)}</td>${BLOOD_TYPES.map(type=>`<td><span class="qty">${counts[type]}</span></td>`).join('')}<td>${pill(facility.verified?'in_stock':'rejected',facility.verified?'Verified':'Unverified')}</td></tr>`);
  }
  return `${heading('Network inventory','Cross-facility availability','Search verified hospital stock. Only screened, in-stock, unexpired units are counted.')}<section class="panel"><div class="panel-head"><div><div class="panel-title">Hospital availability</div><div class="panel-note">${state.facilities.filter(item=>item.type==='Hospital'&&item.verified).length} verified facilities</div></div><input class="search" id="availability-search" type="search" value="${escapeHtml(query)}" placeholder="Facility, district, or group" aria-label="Search facility availability"></div><div class="table-scroll"><table><thead><tr><th>Facility</th><th>District</th>${BLOOD_TYPES.map(type=>`<th>${type}</th>`).join('')}<th>Verification</th></tr></thead><tbody>${rows.join('')||'<tr><td colspan="11" class="empty">No verified facility matches this search.</td></tr>'}</tbody></table></div></section>`;
}

function hubPage(state,session) {
  const facility=state.facilities.find(item=>item.id===session.facilityId);
  const units=state.units.filter(item=>item.facilityId===session.facilityId&&item.status==='in_stock'&&item.expiryDate>today());
  const pending=state.requisitions.filter(item=>item.status==='awaiting_hub_review').length;
  const types=BLOOD_TYPES.map(type=>`<tr><td><span class="blood">${type}</span></td><td class="qty">${units.filter(item=>item.bloodType===type).length}</td><td>${units.filter(item=>item.bloodType===type&&item.viralTestStatus==='negative').length}</td><td>${units.filter(item=>item.bloodType===type&&item.expiryDate<=new Date(Date.now()+7*86400000).toISOString().slice(0,10)).length}</td></tr>`).join('');
  return `${heading('UBTS operations','Regional hub dashboard',`${escapeHtml(facility?.name||'UBTS Hub')} · Hospital requests and screened hub stock`,`<button class="btn btn-secondary" data-page="requests">Review requests →</button>`)}<section class="metrics">${metric('Hub stock',units.length,'Unexpired units')}${metric('Awaiting hub review',pending,'Requisition queue',pending?'warning':'')}${metric('Facilities served',state.facilities.filter(item=>item.hubId===facility?.id&&item.verified).length,'Verified linked hospitals')}${metric('Active network alerts',state.alerts.filter(item=>!item.resolvedAt).length,'Low stock and expiry')}</section><div class="columns">${panel('Hub stock by group','Units ready for fulfillment',`<div class="table-scroll"><table><thead><tr><th>Group</th><th>In stock</th><th>Cleared</th><th>Expiring 7d</th></tr></thead><tbody>${types}</tbody></table></div>`, `<button class="link-btn" data-page="inventory">Unit inventory →</button>`)}${panel('Awaiting approval','Newest facility requests',renderRequests(state.requisitions.filter(item=>item.status==='awaiting_hub_review').slice(0,5),state,session,true),`<button class="link-btn" data-page="requests">Approval queue →</button>`)}</div>`;
}

function alertsPage(state,session) {
  const alerts=state.alerts.filter(item=>session.role==='hub_staff'||item.facilityId===session.facilityId);
  return `${heading('Notifications','Stock and expiry alerts','Threshold and expiry rules are evaluated locally. SMS/push delivery is an adapter stub.')} ${panel('Alert inbox',`${alerts.filter(item=>!item.resolvedAt).length} active · ${alerts.length} total`,renderAlerts(alerts,state))}<div class="notice"><strong>Notification gateway</strong><span>Messages are queued in the local demo outbox. Configure an SMS/push provider to deliver them externally.</span></div>`;
}

function reportsPage(state,session,reports) {
  const scope=session.role==='hub_staff'?null:session.facilityId;
  const totals=reports.snapshot(scope);
  const events=reports.audit(scope);
  return `${heading('Oversight','Reports and audit','Inventory totals and recorded unit movements for the authorized facility scope.')}<section class="metrics">${metric('Available units',totals.totalUnits,'In stock and not expired')}${metric('Expiring within 7 days',totals.expiring,'Current stock')}${metric('Expired / unavailable',totals.expired,'Expired unit count')}${metric('Requisition records',totals.requests,'Facility request history')}</section>${panel('Recent scan events',`${totals.events} audit events`,renderEvents(events,state))}`;
}

function facilitiesPage(state) {
  const cards=state.facilities.map(facility=>{
    const staff=state.staff.filter(item=>item.facilityId===facility.id);
    return `<details class="facility-card" data-facility-id="${escapeHtml(facility.id)}"><summary class="facility-summary"><span class="facility-summary-main"><span class="facility-summary-name">${escapeHtml(facility.name)}</span><span class="facility-meta-line">${escapeHtml(facility.type)} · ${escapeHtml(facility.district)} · ${escapeHtml(facility.id)}</span></span><span class="facility-summary-side">${pill(facility.verified?'in_stock':'rejected',facility.verified?'Verified':'Pending')}<span class="facility-chevron" aria-hidden="true">⌄</span></span></summary><div class="facility-people"><div class="request-list">${staff.map(person=>`<div class="request-item"><div><div class="request-name">${escapeHtml(person.name)}</div><div class="request-meta">${escapeHtml(ROLES[person.role]||person.role)} · ${escapeHtml(person.id)}</div></div>${button('verify-staff',person.verified?'Verified':'Verify',person.verified?'secondary':'primary',`data-id="${escapeHtml(person.id)}" data-verified="${!person.verified}"`)}</div>`).join('')}</div><div class="form-actions">${button('verify-facility',facility.verified?'Suspend facility':'Verify facility',facility.verified?'danger':'primary',`data-id="${escapeHtml(facility.id)}" data-verified="${!facility.verified}"`)}</div></div></details>`;
  }).join('');
  return `${heading('System administration','Facility verification','Verify facilities and staff accounts before granting access to inventory and requisition workflows.')} ${panel('Registered facilities','Verification controls also enable or suspend linked staff accounts',`<div class="facility-card-grid">${cards}</div>`)}`;
}

function auditPage(state,reports) {
  const events=reports.audit(null);
  return `${heading('System administration','System audit trail','Cross-facility scan events for verified administrators.')}${panel('All scan events',`${events.length} records`,renderEvents(events,state))}`;
}

export function renderApplication({state,session,page,query,reports}) {
  const pageAllowed=NAVIGATION[session.role].some(item=>item[0]===page);
  const activePage=pageAllowed?page:NAVIGATION[session.role][0][0];
  const currentFacility=state.facilities.find(item=>item.id===session.facilityId);
  const currentStaff=state.staff.find(item=>item.id===session.staffId);
  const pages={
    overview:()=>overviewPage(state,session),
    inventory:()=>inventoryPage(state,session,query),
    scan:()=>scanPage(),
    requisitions:()=>requestsPage(state,session),
    requests:()=>requestsPage(state,session),
    availability:()=>availabilityPage(state,query),
    hub:()=>hubPage(state,session),
    alerts:()=>alertsPage(state,session),
    reports:()=>reportsPage(state,session,reports),
    facilities:()=>facilitiesPage(state),
    audit:()=>auditPage(state,reports)
  };
  const date=new Intl.DateTimeFormat('en-GB',{weekday:'short',day:'2-digit',month:'short'}).format(new Date());
  const links=NAVIGATION[session.role].map(([id,icon,label])=>`<button type="button" data-page="${id}" class="${activePage===id?'active':''}"><span class="nav-ico" aria-hidden="true">${icon}</span>${label}</button>`).join('');
  return `<div class="shell"><aside class="rail"><div class="brand"><div class="brand-mark" aria-hidden="true">U</div><div><div class="brand-name">UBTS-Link</div><div class="brand-caption">BLOOD SERVICES NETWORK</div></div></div><div class="rail-label">${session.role==='hub_staff'||session.role==='system_admin'?'UBTS WORKSPACE':'HOSPITAL WORKSPACE'}</div><nav class="nav-list" aria-label="Main navigation">${links}</nav><div class="rail-foot"><div class="facility-block"><div class="facility-kicker">Current facility</div><div class="facility-title">${escapeHtml(currentFacility?.name||'—')}</div><div class="facility-detail">${escapeHtml(currentFacility?.district||'')} · ${escapeHtml(ROLES[session.role])}</div></div><div class="identity"><div class="avatar">${escapeHtml((currentStaff?.name||'U').split(' ').map(part=>part[0]).slice(0,2).join(''))}</div><div><div class="identity-name">${escapeHtml(currentStaff?.name||'User')}</div><div class="identity-role">${escapeHtml(ROLES[session.role])}</div></div></div></div></aside><main class="main"><header class="topbar"><div class="crumb">UBTS-Link &nbsp;/&nbsp; <strong>${escapeHtml(PAGE_TITLES[activePage])}</strong></div><div class="top-right"><span class="date-label">${date}</span><select class="role-picker" id="role-picker" aria-label="Switch demo user role">${Object.entries(ROLES).map(([role,label])=>`<option value="${role}" ${session.role===role?'selected':''}>Demo: ${label}</option>`).join('')}</select><span class="demo-label">LOCAL DEMO</span></div></header><div class="content">${pages[activePage]()}<div class="notice"><strong>Demo mode</strong><span>Data is stored in this browser. MySQL, secure authentication, live network sync, and SMS/push delivery require deployment adapters.</span></div></div></main></div>`;
}

export function renderDialog(title,description,body) {
  return `<div class="dialog-backdrop" data-action="close-dialog"><section class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><header class="dialog-head"><div><h2 id="dialog-title">${title}</h2><p>${description}</p></div><button type="button" class="close" data-action="close-dialog" aria-label="Close dialog">×</button></header>${body}</section></div>`;
}

export function requestDialog() {
  return renderDialog('Submit a requisition','A request is routed to facility review or the linked UBTS hub.',`<form id="request-form" class="dialog-body"><div class="form-grid"><div class="field"><label for="request-group">Blood group</label><select id="request-group" name="bloodType">${BLOOD_TYPES.map(type=>`<option>${type}</option>`).join('')}</select></div><div class="field"><label for="request-quantity">Units requested</label><input id="request-quantity" name="unitsRequested" type="number" min="1" max="100" value="2" required></div><div class="field full"><label for="request-urgency">Urgency</label><select id="request-urgency" name="urgency"><option value="routine">Routine</option><option value="urgent">Urgent</option><option value="emergency">Emergency</option></select></div></div><div class="form-error" id="request-error" role="alert"></div><div class="form-actions"><button type="button" class="btn btn-secondary" data-action="close-dialog">Cancel</button><button type="submit" class="btn btn-primary">Submit requisition</button></div></form>`);
}