import { ROLES } from '../domain/constants.js';

const SESSION_KEY='ubts-link-demo-session';

export class AuthService {
  constructor(repository) {
    this.repository=repository;
    this.session=this.restore();
  }

  restore() {
    try {
      const saved=JSON.parse(localStorage.getItem(SESSION_KEY));
      if (saved && ROLES[saved.role]) return saved;
    } catch {}
    return this.setRole('hospital_officer');
  }

  setRole(role) {
    const accounts={
      hospital_officer:'STF-001',clinician:'STF-002',hub_staff:'STF-003',system_admin:'STF-004'
    };
    if (!accounts[role]) throw new Error('Unknown user role.');
    const staff=this.repository.state.staff.find(item=>item.id===accounts[role]);
    if (!staff) throw new Error('Demo account is not configured.');
    this.session={staffId:staff.id,facilityId:staff.facilityId,role:staff.role};
    localStorage.setItem(SESSION_KEY,JSON.stringify(this.session));
    return this.session;
  }

  current() { return this.session; }

  require(...roles) {
    const staff=this.repository.state.staff.find(item=>item.id===this.session.staffId);
    const facility=this.repository.state.facilities.find(item=>item.id===this.session.facilityId);
    if (!staff?.verified || !facility?.verified) throw new Error('This account or facility has not been verified.');
    if (!roles.includes(this.session.role)) throw new Error('Your role is not authorized for this action.');
    return {staff,facility};
  }

  verifyFacility(facilityId,verified) {
    this.require('system_admin');
    const facility=this.repository.state.facilities.find(item=>item.id===facilityId);
    if (!facility) throw new Error('Facility not found.');
    facility.verified=verified;
    for (const staff of this.repository.state.staff.filter(item=>item.facilityId===facilityId)) staff.verified=verified;
    this.repository.save('facility.verification.changed');
  }

  verifyStaff(staffId,verified) {
    this.require('system_admin');
    const staff=this.repository.state.staff.find(item=>item.id===staffId);
    if (!staff) throw new Error('Staff account not found.');
    staff.verified=verified;
    this.repository.save('staff.verification.changed');
  }

  label() { return ROLES[this.session.role]; }
}