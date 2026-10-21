import { LOW_STOCK_THRESHOLD, makeId, today } from '../domain/constants.js';

export class RequisitionService {
  constructor(repository,auth,alertEngine) {
    this.repository=repository;
    this.auth=auth;
    this.alertEngine=alertEngine;
  }

  activeFor(facilityId,bloodType) {
    return this.repository.state.requisitions.some(request=>request.facilityId===facilityId&&request.bloodType===bloodType&&!['rejected','fulfilled'].includes(request.status));
  }

  submit({bloodType,unitsRequested,urgency='routine'}) {
    const {staff,facility}=this.auth.require('hospital_officer','clinician');
    const quantity=Number(unitsRequested);
    if (!bloodType || !Number.isInteger(quantity) || quantity<1 || quantity>100) throw new Error('Enter a blood group and a quantity from 1 to 100.');
    const request={id:makeId('REQ'),facilityId:facility.id,staffId:staff.id,bloodType,unitsRequested:quantity,urgency,status:staff.role==='clinician'?'awaiting_facility_review':'awaiting_hub_review',requestTime:new Date().toISOString()};
    this.repository.state.requisitions.unshift(request);
    this.alertEngine.add({facilityId:facility.id,type:'requisition',title:'Requisition submitted',detail:`${quantity} ${bloodType} units requested by ${staff.name}.`,requestId:request.id});
    this.repository.save('requisition.created');
    return request;
  }

  autoCreateLowStock() {
    for (const facility of this.repository.state.facilities.filter(item=>item.type==='Hospital'&&item.verified)) {
      const linkedHub=this.repository.state.facilities.find(item=>item.id===facility.hubId);
      if (!linkedHub?.verified) continue;
      for (const bloodType of ['O+','O-','A+','A-','B+','B-','AB+','AB-']) {
        const count=this.repository.state.units.filter(unit=>unit.facilityId===facility.id&&unit.bloodType===bloodType&&unit.status==='in_stock'&&unit.viralTestStatus==='negative'&&unit.expiryDate>today()).length;
        if (count>LOW_STOCK_THRESHOLD||this.activeFor(facility.id,bloodType)) continue;
        const request={id:makeId('REQ'),facilityId:facility.id,staffId:null,bloodType,unitsRequested:Math.max(LOW_STOCK_THRESHOLD*2-count,LOW_STOCK_THRESHOLD),urgency:count<=2?'urgent':'routine',status:'awaiting_hub_review',requestTime:new Date().toISOString(),automated:true};
        this.repository.state.requisitions.unshift(request);
      }
    }
  }

  reviewByFacility(requestId,decision) {
    const {facility}=this.auth.require('hospital_officer');
    const request=this.find(requestId);
    if (request.facilityId!==facility.id||request.status!=='awaiting_facility_review') throw new Error('This request is not awaiting review at your facility.');
    request.status=decision==='approve'?'awaiting_hub_review':'rejected';
    request.reviewedAt=new Date().toISOString();
    this.repository.save('requisition.facility_reviewed');
  }

  reviewByHub(requestId,decision) {
    const {facility:hub}=this.auth.require('hub_staff');
    const request=this.find(requestId);
    const hospital=this.repository.state.facilities.find(item=>item.id===request.facilityId);
    if (hospital?.hubId!==hub.id) throw new Error('This request is not routed to your hub.');
    if (request.status!=='awaiting_hub_review') throw new Error('This request is no longer awaiting hub review.');
    request.status=decision==='approve'?'approved':'rejected';
    request.hubDecisionAt=new Date().toISOString();
    this.repository.save('requisition.hub_reviewed');
  }

  dispatch(requestId) {
    const {facility:hub}=this.auth.require('hub_staff');
    const request=this.find(requestId);
    if (request.status!=='approved') throw new Error('Approve the request before dispatch.');
    const hospital=this.repository.state.facilities.find(item=>item.id===request.facilityId);
    if (hospital?.hubId!==hub.id) throw new Error('This request is not routed to your hub.');
    const units=this.repository.state.units.filter(unit=>unit.facilityId===hub.id&&unit.bloodType===request.bloodType&&unit.status==='in_stock'&&unit.viralTestStatus==='negative'&&unit.expiryDate>today()).slice(0,request.unitsRequested);
    if (units.length<request.unitsRequested) throw new Error(`Only ${units.length} safe ${request.bloodType} units are available at this hub.`);
    for (const unit of units) {
      unit.status='in_transit';
      const fulfillment={id:makeId('FUL'),requestId:request.id,facilityId:hub.id,unitId:unit.id,status:'dispatched',dispatchTime:new Date().toISOString(),receivingTime:null};
      this.repository.state.fulfillments.push(fulfillment);
      this.repository.state.scanEvents.unshift({id:makeId('SCN'),unitId:unit.id,facilityId:hub.id,fulfillmentId:fulfillment.id,staffId:this.auth.current().staffId,eventType:'transfer',timestamp:new Date().toISOString()});
    }
    request.status='dispatched';
    this.repository.save('requisition.dispatched');
  }

  receive(requestId) {
    const {facility}=this.auth.require('hospital_officer');
    const request=this.find(requestId);
    if (request.facilityId!==facility.id||request.status!=='dispatched') throw new Error('No dispatched request for this facility.');
    const fulfillments=this.repository.state.fulfillments.filter(item=>item.requestId===requestId&&item.status==='dispatched');
    for (const item of fulfillments) {
      const unit=this.repository.state.units.find(record=>record.id===item.unitId);
      unit.facilityId=facility.id;unit.status='in_stock';
      item.status='received';item.receivingTime=new Date().toISOString();
      this.repository.state.scanEvents.unshift({id:makeId('SCN'),unitId:unit.id,facilityId:facility.id,fulfillmentId:item.id,staffId:this.auth.current().staffId,eventType:'intake',timestamp:new Date().toISOString()});
    }
    request.status='fulfilled';
    this.repository.save('requisition.received');
  }

  find(requestId) {
    const request=this.repository.state.requisitions.find(item=>item.id===requestId);
    if (!request) throw new Error('Requisition not found.');
    return request;
  }
}