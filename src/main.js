import { BLOOD_TYPES, NAVIGATION, ROLES, STORAGE_KEY } from './domain/constants.js';
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
import { decodeBarcodeImage, parseISBT128, generateBarcodeCanvas } from './external/isbt-scanner.js';

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
let lastScannedResult = null;
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
    lastScannedResult,
    reports
  });

  app.querySelectorAll('details[data-facility-id]').forEach(item => {
    if (expandedFacilities.has(item.dataset.facilityId)) item.open = true;
  });
}

function toast(message, error = false) {
  const icon = error
    ? '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
    : '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>';
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

async function handleBarcodeFile(file) {
  if (!file) return;
  toast('Processing barcode image...');
  try {
    const decoded = await decodeBarcodeImage(file);
    lastScannedResult = {
      ...parseISBT128(decoded.rawValue, repository.state),
      method: decoded.method,
      previewUrl: decoded.previewUrl
    };
    render();
    toast(`Decoded ISBT-128 Barcode: ${lastScannedResult.barcode}`);
    setTimeout(() => {
      document.getElementById('scanned-result-view')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 60);
  } catch (err) {
    toast(err.message, true);
  }
}

async function execute(action, id, verified, element) {
  if (action === 'open-request' || action === 'quick-reorder') {
    const bloodType = element?.dataset.bloodType || 'O-';
    dialogRoot.innerHTML = requestDialog(bloodType);
    dialogRoot.querySelector('#request-lines [name="bloodTypes[]"]')?.focus();
    return;
  }

  if (action === 'add-request-line') {
    const container = dialogRoot.querySelector('#request-lines');
    const rows = [...(container?.querySelectorAll('.request-line') || [])];
    if (rows.length >= BLOOD_TYPES.length) {
      toast('All blood groups are already listed.', true);
      return;
    }
    const selected = new Set(rows.map(row => row.querySelector('[name="bloodTypes[]"]').value));
    const nextGroup = BLOOD_TYPES.find(type => !selected.has(type));
    const row = rows[0].cloneNode(true);
    row.querySelector('[name="bloodTypes[]"]').value = nextGroup;
    row.querySelector('[name="unitQuantities[]"]').value = '4';
    container.append(row);
    container.querySelectorAll('[data-action="remove-request-line"]').forEach(button => { button.disabled = false; });
    row.querySelector('[name="bloodTypes[]"]').focus();
    return;
  }

  if (action === 'remove-request-line') {
    const container = element?.closest('#request-lines');
    const rows = [...(container?.querySelectorAll('.request-line') || [])];
    if (rows.length > 1) {
      element.closest('.request-line').remove();
      const remainingRows = container.querySelectorAll('.request-line');
      if (remainingRows.length === 1) remainingRows[0].querySelector('[data-action="remove-request-line"]').disabled = true;
    }
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

  if (action === 'clear-scan-result') {
    lastScannedResult = null;
    render();
    toast('Scan result cleared.');
    return;
  }

  if (action === 'test-sample-label') {
    const type = element?.dataset.type || 'O-';
    const session = auth.current();
    const facilityCode = (session.facilityId || 'FAC-001').slice(-3);
    const randomSerial = String(Math.floor(1000 + Math.random() * 9000));
    const barcode = `IST128-26-${facilityCode}-${randomSerial}`;
    const facility = repository.state.facilities.find(f => f.id === session.facilityId);

    const sample = generateBarcodeCanvas({
      barcode,
      bloodType: type,
      component: 'Whole blood',
      facilityName: facility?.name || 'Kampala Regional Hospital'
    });

    try {
      const decoded = await decodeBarcodeImage(sample.canvas);
      lastScannedResult = {
        ...parseISBT128(decoded.rawValue, repository.state),
        bloodType: type,
        method: decoded.method,
        previewUrl: sample.dataUrl
      };
      render();
      toast(`Decoded sample label: ${lastScannedResult.barcode} (${lastScannedResult.bloodType})`);
      setTimeout(() => {
        document.getElementById('scanned-result-view')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 60);
    } catch (err) {
      toast(err.message, true);
    }
    return;
  }

  if (action === 'download-sample-label') {
    const session = auth.current();
    const facilityCode = (session.facilityId || 'FAC-001').slice(-3);
    const barcode = `IST128-26-${facilityCode}-${Math.floor(1000 + Math.random() * 9000)}`;
    const sample = generateBarcodeCanvas({
      barcode,
      bloodType: 'O-',
      component: 'Whole blood',
      facilityName: 'Kampala Regional Hospital'
    });

    const link = document.createElement('a');
    link.href = sample.dataUrl;
    link.download = `isbt128-sample-${barcode}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast('Sample ISBT-128 barcode label downloaded as PNG.');
    return;
  }

  if (action === 'apply-scan-intake') {
    const barcode = element?.dataset.barcode || lastScannedResult?.barcode;
    const bloodType = element?.dataset.type || lastScannedResult?.bloodType;
    const component = element?.dataset.component || lastScannedResult?.component;
    const expiry = element?.dataset.expiry || lastScannedResult?.expiryDate;

    const bInput = document.getElementById('intake-barcode');
    const tInput = document.getElementById('intake-type');
    const cInput = document.getElementById('intake-component');
    const eInput = document.getElementById('intake-expiry');

    if (bInput && barcode) bInput.value = barcode;
    if (tInput && bloodType) tInput.value = bloodType;
    if (cInput && component) cInput.value = component;
    if (eInput && expiry) eInput.value = expiry;

    const form = document.getElementById('intake-form');
    form?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    bInput?.focus();
    toast(`Barcode ${barcode} loaded into Intake Form.`);
    return;
  }

  if (action === 'open-received-container') {
    inventory.openReceivedContainer(id);
    render();
    document.querySelector(`[data-container-id="${CSS.escape(id)}"] input[name="barcode"]`)?.focus();
    toast('Container opened. Scan each received unit barcode to reconcile the queue.');
    return;
  }

  if (action === 'download-container-barcodes') {
    const container = repository.state.receivedContainers.find(item => item.id === id && item.facilityId === auth.current().facilityId);
    if (!container?.simulationBarcodes?.length) throw new Error('No simulation barcodes are available for this container.');
    const lines = [
      'UBTS-Link demo barcode list',
      `Container: ${container.id}`,
      `Requisition: ${container.requestId}`,
      'Each code is unique to one unit and can be used once.',
      '',
      ...container.simulationBarcodes.map(entry => {
        const unit = repository.state.units.find(item => item.id === entry.unitId);
        return `${entry.barcode}\t${unit?.bloodType || 'Unknown'}\t${entry.usedAt ? 'USED' : 'AVAILABLE'}`;
      })
    ];
    const blob = new Blob([lines.join('\r\n')], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `container-${container.id}-barcodes.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast('One-time simulation barcodes downloaded as a TXT file.');
    return;
  }

  if (action === 'apply-scan-dispense') {
    const barcode = element?.dataset.barcode || lastScannedResult?.barcode;
    const input = document.getElementById('movement-barcode');
    if (input && barcode) {
      input.value = barcode;
      scanner.bind(input);
      const form = document.getElementById('movement-form');
      form?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      toast(`Barcode ${barcode} loaded into Dispense Form.`);
    }
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
    lastScannedResult = null;
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
  // Check if click was inside dropzone (and not on a button)
  const dropzone = event.target.closest('#barcode-dropzone');
  if (dropzone && !event.target.closest('button')) {
    document.getElementById('barcode-file-input')?.click();
    return;
  }

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
  if (event.target.id === 'barcode-file-input') {
    const file = event.target.files?.[0];
    if (file) {
      handleBarcodeFile(file);
    }
  } else if (event.target.id === 'role-picker') {
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

// Drag and drop support for barcode dropzone
document.addEventListener('dragover', event => {
  const dropzone = event.target.closest('#barcode-dropzone');
  if (dropzone) {
    event.preventDefault();
    dropzone.classList.add('dragover');
  }
});

document.addEventListener('dragleave', event => {
  const dropzone = event.target.closest('#barcode-dropzone');
  if (dropzone && !dropzone.contains(event.relatedTarget)) {
    dropzone.classList.remove('dragover');
  }
});

document.addEventListener('drop', event => {
  const dropzone = event.target.closest('#barcode-dropzone');
  if (dropzone) {
    event.preventDefault();
    dropzone.classList.remove('dragover');
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      handleBarcodeFile(file);
    }
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
      toast(`Unit ${unit.barcode} (${unit.bloodType}) scanned into inventory!`);
    } else if (form.matches('.container-scan-form')) {
      const container = repository.state.receivedContainers.find(item => item.id === form.dataset.containerId);
      const unit = inventory.scanIntake(data);
      const remaining = container.unitIds.length - container.scannedUnitIds.length;
      render();
      toast(`${unit.barcode} reconciled. ${remaining} unit${remaining === 1 ? '' : 's'} remain in the container.`);
    } else if (form.id === 'movement-form') {
      const unit = inventory.scanMovement(data);
      render();
      toast(`${unit.bloodType} unit movement recorded: ${data.eventType}`);
    } else if (form.id === 'request-form') {
      const items = [...form.querySelectorAll('.request-line')].map(row => ({
        bloodType: row.querySelector('[name="bloodTypes[]"]').value,
        unitsRequested: row.querySelector('[name="unitQuantities[]"]').value
      }));
      const requests = requisitions.submitMany(items, data.urgency);
      closeDialog();
      render();
      toast(`Requisition submitted for ${requests.length} blood group${requests.length === 1 ? '' : 's'}.`);
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
