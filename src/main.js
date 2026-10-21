import { NAVIGATION, ROLES } from './domain/constants.js';
import { LocalRepository } from './data/local-repository.js';
import { AuthService } from './application/auth-service.js';
import { AlertEngine } from './application/alert-engine.js';
import { RequisitionService } from './application/requisition-service.js';
import { InventoryService } from './application/inventory-service.js';
import { ReportService } from './application/report-service.js';
import { SyncEngine } from './application/sync-engine.js';
import { BarcodeScanner } from './external/barcode-scanner.js';
import { NotificationGateway } from './external/notification-gateway.js';
import { renderApplication, requestDialog } from './ui/view.js';

const app=document.getElementById('app');
const dialogRoot=document.getElementById('dialog-root');
const toastRoot=document.getElementById('toast-root');
const repository=new LocalRepository();
const auth=new AuthService(repository);
const scanner=new BarcodeScanner();
const notificationGateway=new NotificationGateway(repository);
const alertEngine=new AlertEngine(repository,notificationGateway);
const requisitions=new RequisitionService(repository,auth,alertEngine);
const inventory=new InventoryService(repository,auth,scanner,alertEngine,requisitions);
const reports=new ReportService(repository,auth);
let page=NAVIGATION[auth.current().role][0][0];
let query='';
let toastTimer;

function render() {
  const expandedFacilities=new Set([...app.querySelectorAll('details[data-facility-id][open]')].map(item=>item.dataset.facilityId));
  app.innerHTML=renderApplication({state:repository.state,session:auth.current(),page,query,reports});
  app.querySelectorAll('details[data-facility-id]').forEach(item=>{
    if (expandedFacilities.has(item.dataset.facilityId)) item.open=true;
  });
}

function toast(message,error=false) {
  toastRoot.innerHTML=`<div class="toast ${error?'error':''}" role="status">${escapeHtml(message)}</div>`;
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>toastRoot.replaceChildren(),3200);
}

function escapeHtml(value) {
  return String(value??'').replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
}

function closeDialog() { dialogRoot.replaceChildren(); }

function showError(formId,message) {
  const node=document.querySelector(`#${formId} .form-error`);
  if (node) { node.textContent=message;node.classList.add('show'); }
}

function execute(action,id,verified) {
  if (action==='open-request') { dialogRoot.innerHTML=requestDialog();document.getElementById('request-group')?.focus();return; }
  if (action==='close-dialog') { closeDialog();return; }
  if (action==='prefill-dispense') {
    page='scan';render();
    const input=document.getElementById('movement-barcode');
    input.value=document.querySelector(`[data-action="prefill-dispense"][data-barcode="${CSS.escape(id)}"]`)?.dataset.barcode||id;
    scanner.bind(input);return;
  }
  if (action==='facility-approve'||action==='facility-reject') requisitions.reviewByFacility(id,action==='facility-approve'?'approve':'reject');
  else if (action==='hub-approve'||action==='hub-reject') requisitions.reviewByHub(id,action==='hub-approve'?'approve':'reject');
  else if (action==='dispatch') requisitions.dispatch(id);
  else if (action==='receive') requisitions.receive(id);
  else if (action==='verify-facility') auth.verifyFacility(id,verified==='true');
  else if (action==='verify-staff') auth.verifyStaff(id,verified==='true');
  else return;
  alertEngine.refresh();
  render();
  toast('Record updated.');
}

function handleClick(event) {
  const target=event.target.closest('[data-page],[data-action]');
  if (!target) return;
  if (target.dataset.page) { page=target.dataset.page;query='';render();return; }
  if (target.dataset.action==='close-dialog'&&event.target!==target&&!target.matches('button')) return;
  try { execute(target.dataset.action,target.dataset.id,target.dataset.verified); }
  catch (error) { toast(error.message,true); }
}

document.addEventListener('click',handleClick);

document.addEventListener('change',event=>{
  if (event.target.id==='role-picker') {
    try {
      const session=auth.setRole(event.target.value);
      page=NAVIGATION[session.role][0][0];query='';render();
    } catch(error) { toast(error.message,true); }
  }
});

document.addEventListener('input',event=>{
  if (!['inventory-search','availability-search'].includes(event.target.id)) return;
  query=event.target.value;
  const id=event.target.id,position=event.target.selectionStart;
  render();
  const input=document.getElementById(id);
  input?.focus();input?.setSelectionRange(position,position);
});

document.addEventListener('submit',event=>{
  const form=event.target;
  if (!(form instanceof HTMLFormElement)) return;
  event.preventDefault();
  const data=Object.fromEntries(new FormData(form));
  try {
    if (form.id==='intake-form') {
      const unit=inventory.scanIntake(data);
      render();toast(`${unit.bloodType} unit received into stock.`);
    } else if (form.id==='movement-form') {
      const unit=inventory.scanMovement(data);
      render();toast(`${unit.bloodType} unit movement recorded.`);
    } else if (form.id==='request-form') {
      const request=requisitions.submit(data);
      closeDialog();render();toast(`Request ${request.id} submitted.`);
    }
  } catch(error) {
    const errorId=form.id==='intake-form'?'intake-form':form.id==='movement-form'?'movement-form':'request-form';
    showError(errorId,error.message);
  }
});

document.addEventListener('keydown',event=>{if(event.key==='Escape'&&dialogRoot.firstElementChild)closeDialog();});

window.addEventListener('ubts:sync',event=>{
  if (event.detail?.source==='another-tab') repository.reload();
  render();
});

const sync=new SyncEngine(repository,()=>render());
sync.start();
requisitions.autoCreateLowStock();
alertEngine.refresh();
render();