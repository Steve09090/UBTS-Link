import { NAVIGATION, ROLES, STORAGE_KEY } from './domain/constants.js';
import { LocalRepository } from './data/local-repository.js';
import { AuthService } from './application/auth-service.js';
import { AlertEngine } from './application/alert-engine.js';
import { RequisitionService } from './application/requisition-service.js';
import { InventoryService } from './application/inventory-service.js';
import { ReportService } from './application/report-service.js';
import { SyncEngine } from './application/sync-engine.js';
import { BarcodeScanner } from './external/barcode-scanner.js';
import { NotificationGateway } from './external/notification-gateway.js';
import { renderApplication, requestDialog, unitInspectDialog } from './ui/view.js';

const app = document.getElementById('app');
const dialogRoot = document.getElementById('dialog-root');
const toastRoot = document.getElementById('toast-root');
const repository = new LocalRepository();
const auth = new AuthService(repository);
const scanner = new BarcodeScanner();
const notificationGateway = new NotificationGateway(repository);
const alertEngine = new AlertEngine(repository, notificationGateway);
const requisitions = new RequisitionService(repository, auth, alertEngine);
const inventory = new InventoryService(repository, auth, scanner, alertEngine, requisitions);
const reports = new ReportService(repository, auth);

let page = NAVIGATION[auth.current().role][0][0];
let query = '';
let filterBlood = 'all';
let filterStatus = 'all';
let filterTab = 'all';
let filterDistrict = 'all';
let toastTimer;

function render() {
  const expandedFacilities = new Set([...app.querySelectorAll('details[data-facility-id][open]')].map(item => item.dataset.facilityId));
  app.innerHTML = renderApplication({
    state: repository.state,
    session: auth.current(),
    page,
    query,
    filterBlood,
    filterStatus,
    filterTab,
    filterDistrict,
    reports
  });

  app.querySelectorAll('details[data-facility-id]').forEach(item => {
    if (expandedFacilities.has(item.dataset.facilityId)) item.open = true;
  });
}

function toast(message, error = false) {
  const icon = error
    ? '<span style="font-size:16px;">⚠️</span>'
    : '<span style="font-size:16px;">✓</span>';
  toastRoot.innerHTML = `<div class="toast ${error ? 'error' : ''}" role="status">${icon} <span>${escapeHtml(message)}</span></div>`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastRoot.replaceChildren(), 3400);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]));
}

function closeDialog() {
  dialogRoot.replaceChildren();
}

function showError(formId, message) {
  const node = document.querySelector(`#${formId} .form-error`);
  if (node) {
    node.textContent = message;
    node.classList.add('show');
  }
}

function execute(action, id, verified, element) {
  if (action === 'open-request' || action === 'quick-reorder') {
    const bloodType = element?.dataset.bloodType || 'O-';
    dialogRoot.innerHTML = requestDialog(bloodType);
    document.getElementById('request-group')?.focus();
    return;
  }

  if (action === 'close-dialog') {
    closeDialog();
    return;
  }

  if (action === 'inspect-unit') {
    const barcode = element?.dataset.barcode || id;
    const unit = repository.state.units.find(u => u.barcode === barcode);
    if (!unit) {
      toast('Unit record not found.', true);
      return;
    }
    const facility = repository.state.facilities.find(f => f.id === unit.facilityId);
    dialogRoot.innerHTML = unitInspectDialog(unit, facility);
    return;
  }

  if (action === 'generate-barcode') {
    const session = auth.current();
    const facilityCode = (session.facilityId || 'FAC-001').slice(-3);
    const randomSerial = String(Math.floor(1000 + Math.random() * 9000));
    const randomBarcode = `IST128-26-${facilityCode}-${randomSerial}`;

    const barcodeInput = document.getElementById('intake-barcode');
    const expiryInput = document.getElementById('intake-expiry');
    const typeInput = document.getElementById('intake-type');

    if (barcodeInput) barcodeInput.value = randomBarcode;
    if (expiryInput) {
      const expDate = new Date();
      expDate.setDate(expDate.getDate() + 35);
      expiryInput.value = expDate.toISOString().slice(0, 10);
    }
    if (typeInput && Math.random() > 0.5) {
      typeInput.value = 'O-';
    }
    toast(`Generated sample barcode: ${randomBarcode}`);
    return;
  }

  if (action === 'select-stock-barcode') {
    const barcode = element?.dataset.barcode;
    const input = document.getElementById('movement-barcode');
    if (input && barcode) {
      input.value = barcode;
      scanner.bind(input);
      toast(`Selected unit: ${barcode}`);
    }
    return;
  }

  if (action === 'export-inventory') {
    const units = repository.state.units;
    const headers = ['ID', 'Barcode', 'BloodGroup', 'Component', 'FacilityId', 'CollectionDate', 'ExpiryDate', 'ViralScreening', 'Status'];
    const rows = units.map(u => [
      u.id,
      `"${u.barcode}"`,
      u.bloodType,
      `"${u.component}"`,
      u.facilityId,
      u.collectionDate,
      u.expiryDate,
      u.viralTestStatus,
      u.status
    ].join(','));
    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ubts-inventory-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast('Inventory report exported as CSV.');
    return;
  }

  if (action === 'reset-demo') {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('ubts-link-demo-session');
    repository.state = repository.load();
    auth.setRole('hospital_officer');
    page = NAVIGATION[auth.current().role][0][0];
    query = '';
    filterBlood = 'all';
    filterStatus = 'all';
    filterTab = 'all';
    filterDistrict = 'all';
    requisitions.autoCreateLowStock();
    alertEngine.refresh();
    render();
    toast('Demo state has been restored to default seed.');
    return;
  }

  if (action === 'prefill-dispense') {
    closeDialog();
    page = 'scan';
    render();
    const barcode = element?.dataset.barcode || id;
    const input = document.getElementById('movement-barcode');
    if (input) {
      input.value = barcode;
      scanner.bind(input);
    }
    toast(`Barcode ${barcode} loaded into dispense scanner.`);
    return;
  }

  if (action === 'facility-approve' || action === 'facility-reject') {
    requisitions.reviewByFacility(id, action === 'facility-approve' ? 'approve' : 'reject');
  } else if (action === 'hub-approve' || action === 'hub-reject') {
    requisitions.reviewByHub(id, action === 'hub-approve' ? 'approve' : 'reject');
  } else if (action === 'dispatch') {
    requisitions.dispatch(id);
  } else if (action === 'receive') {
    requisitions.receive(id);
  } else if (action === 'verify-facility') {
    auth.verifyFacility(id, verified === 'true');
  } else if (action === 'verify-staff') {
    auth.verifyStaff(id, verified === 'true');
  } else {
    return;
  }

  alertEngine.refresh();
  render();
  toast('Record updated successfully.');
}

function handleClick(event) {
  const target = event.target.closest('[data-page], [data-action], [data-filter-blood], [data-filter-tab], [data-filter-district]');
  if (!target) return;

  // Filter chips
  if (target.dataset.filterBlood) {
    filterBlood = target.dataset.filterBlood;
    render();
    return;
  }
  if (target.dataset.filterTab) {
    filterTab = target.dataset.filterTab;
    render();
    return;
  }
  if (target.dataset.filterDistrict) {
    filterDistrict = target.dataset.filterDistrict;
    render();
    return;
  }

  // Page navigation
  if (target.dataset.page) {
    page = target.dataset.page;
    query = '';
    filterBlood = 'all';
    filterStatus = 'all';
    filterTab = 'all';
    filterDistrict = 'all';
    render();
    return;
  }

  if (target.dataset.action === 'close-dialog' && event.target !== target && !target.matches('button')) {
    return;
  }

  try {
    execute(target.dataset.action, target.dataset.id, target.dataset.verified, target);
  } catch (error) {
    toast(error.message, true);
  }
}

document.addEventListener('click', handleClick);

document.addEventListener('change', event => {
  if (event.target.id === 'role-picker') {
    try {
      const session = auth.setRole(event.target.value);
      page = NAVIGATION[session.role][0][0];
      query = '';
      filterBlood = 'all';
      filterStatus = 'all';
      filterTab = 'all';
      filterDistrict = 'all';
      render();
      toast(`Switched to: ${ROLES[session.role]}`);
    } catch (error) {
      toast(error.message, true);
    }
  } else if (event.target.id === 'inventory-status-filter') {
    filterStatus = event.target.value;
    render();
  }
});

document.addEventListener('input', event => {
  if (!['inventory-search', 'availability-search'].includes(event.target.id)) return;
  query = event.target.value;
  const id = event.target.id;
  const position = event.target.selectionStart;
  render();
  const input = document.getElementById(id);
  input?.focus();
  input?.setSelectionRange(position, position);
});

document.addEventListener('submit', event => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form));

  try {
    if (form.id === 'intake-form') {
      const unit = inventory.scanIntake(data);
      render();
      toast(`Unit ${unit.barcode} (${unit.bloodType}) added to inventory!`);
    } else if (form.id === 'movement-form') {
      const unit = inventory.scanMovement(data);
      render();
      toast(`${unit.bloodType} unit movement recorded: ${data.eventType}`);
    } else if (form.id === 'request-form') {
      const request = requisitions.submit(data);
      closeDialog();
      render();
      toast(`Requisition ${request.id} for ${request.unitsRequested} units of ${request.bloodType} submitted.`);
    }
  } catch (error) {
    const errorId = form.id === 'intake-form' ? 'intake-error' : form.id === 'movement-form' ? 'movement-error' : 'request-error';
    const formNode = form.querySelector('.form-error') || document.getElementById(errorId);
    if (formNode) {
      formNode.textContent = error.message;
      formNode.classList.add('show');
    } else {
      toast(error.message, true);
    }
  }
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && dialogRoot.firstElementChild) {
    closeDialog();
  }
  // Quick shortcut '/' to focus search if not in an input
  if (event.key === '/' && !['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
    const searchInput = document.getElementById('inventory-search') || document.getElementById('availability-search');
    if (searchInput) {
      event.preventDefault();
      searchInput.focus();
    }
  }
});

window.addEventListener('ubts:sync', event => {
  if (event.detail?.source === 'another-tab') repository.reload();
  render();
});

const sync = new SyncEngine(repository, () => render());
sync.start();
requisitions.autoCreateLowStock();
alertEngine.refresh();
render();
