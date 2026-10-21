export const BLOOD_TYPES = ['O+','O-','A+','A-','B+','B-','AB+','AB-'];
export const LOW_STOCK_THRESHOLD = 6;
export const STORAGE_KEY = 'ubts-link-platform-v2';
export const ROLES = {
  hospital_officer: 'Hospital / Blood Bank Officer',
  clinician: 'Clinician',
  hub_staff: 'UBTS Hub Staff',
  system_admin: 'System Admin'
};
export const NAVIGATION = {
  hospital_officer: [
    ['overview','⌂','Local dashboard'],['inventory','▤','Hospital stock'],['scan','⌕','Hospital scan app'],
    ['requisitions','↗','Requisitions'],['alerts','!','Alerts'],['reports','▥','Reports & audit']
  ],
  clinician: [['availability','⌕','Find availability'],['requisitions','↗','My requisitions'],['alerts','!','Alerts']],
  hub_staff: [
    ['hub','⌂','Hub dashboard'],['inventory','▤','Hub inventory'],['requests','↗','Approval queue'],
    ['availability','⌕','Facility search'],['reports','▥','Reports & audit']
  ],
  system_admin: [['facilities','◎','Facility verification'],['availability','⌕','Facility search'],['audit','◷','Audit trail']]
};
export const PAGE_TITLES = {
  overview:'Local stock dashboard',inventory:'Blood unit inventory',scan:'Hospital scan app',
  requisitions:'Requisition requests',alerts:'Stock and expiry alerts',reports:'Reports and audit',
  availability:'Cross-facility availability',hub:'UBTS hub dashboard',requests:'Requisition approvals',
  facilities:'Facility and staff verification',audit:'System audit trail'
};
export const today = () => new Date().toISOString().slice(0,10);
export const shiftDate = (days) => {
  const date = new Date();
  date.setDate(date.getDate()+days);
  return date.toISOString().slice(0,10);
};
export const makeId = (prefix) => `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;
export const formatDate = (value) => value ? new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(`${value.slice(0,10)}T00:00:00`)) : '—';
export const formatDateTime = (value) => value ? new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(value)) : '—';