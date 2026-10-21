import { today, shiftDate } from '../domain/constants.js';

export class ReportService {
  constructor(repository,auth) { this.repository=repository;this.auth=auth; }

  snapshot(facilityId=null) {
    this.auth.require('hospital_officer','hub_staff');
    const state=this.repository.state;
    const units=state.units.filter(unit=>!facilityId||unit.facilityId===facilityId);
    const available=units.filter(unit=>unit.status==='in_stock'&&unit.expiryDate>today());
    return {
      totalUnits:available.length,
      expiring:available.filter(unit=>unit.expiryDate<=shiftDate(7)).length,
      expired:units.filter(unit=>unit.status==='expired'||unit.expiryDate<=today()).length,
      requests:state.requisitions.filter(request=>!facilityId||request.facilityId===facilityId).length,
      events:state.scanEvents.filter(event=>!facilityId||event.facilityId===facilityId).length
    };
  }

  audit(facilityId=null) {
    this.auth.require('hospital_officer','hub_staff','system_admin');
    const state=this.repository.state;
    return state.scanEvents.filter(event=>!facilityId||event.facilityId===facilityId).map(event=>({
      ...event,unit:state.units.find(unit=>unit.id===event.unitId),facility:state.facilities.find(item=>item.id===event.facilityId),staff:state.staff.find(item=>item.id===event.staffId)
    }));
  }
}