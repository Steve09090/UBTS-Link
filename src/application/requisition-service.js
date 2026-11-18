import { AUTO_REQUISITION_QUANTITY, AUTO_REQUISITION_THRESHOLD, BLOOD_TYPES, makeId, makeUniqueDemoBarcode, today } from '../domain/constants.js';

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
    return this.submitMany([{bloodType,unitsRequested}],urgency)[0];
  }

  submitMany(items,urgency='routine') {
    const {staff,facility}=this.auth.require('hospital_officer','clinician');
    if (!Array.isArray(items)||items.length<1) throw new Error('Add at least one blood group to the requisition.');
    if (!['routine','urgent','emergency'].includes(urgency)) throw new Error('Select a valid urgency level.');
    const selectedGroups=new Set();
    const normalizedItems=items.map(({bloodType,unitsRequested})=>{
      const quantity=Number(unitsRequested);
      if (!BLOOD_TYPES.includes(bloodType)) throw new Error('Select a valid blood group for every requisition line.');
      if (selectedGroups.has(bloodType)) throw new Error('Each blood group can only appear once. Change or remove the duplicate line.');
      selectedGroups.add(bloodType);
      if (!Number.isInteger(quantity)||quantity<1||quantity>100) throw new Error('Enter a quantity from 1 to 100 for every blood group.');
      return {bloodType,unitsRequested:quantity};
    });
    const requestTime=new Date().toISOString();
    const requests=normalizedItems.map(({bloodType,unitsRequested})=>({
      id:makeId('REQ'),facilityId:facility.id,staffId:staff.id,bloodType,unitsRequested,urgency,
      status:staff.role==='clinician'?'awaiting_facility_review':'awaiting_hub_review',requestTime
    }));
    this.repository.state.requisitions.unshift(...requests);
    for (const request of requests) {
      this.alertEngine.add({facilityId:facility.id,type:'requisition',title:'Requisition submitted',detail:`${request.unitsRequested} ${request.bloodType} units requested by ${staff.name}.`,requestId:request.id});
    }
    this.repository.save('requisition.created');
    return requests;
  }

  autoCreateLowStock() {
    for (const facility of this.repository.state.facilities.filter(item=>item.type==='Hospital'&&item.verified)) {
      const linkedHub=this.repository.state.facilities.find(item=>item.id===facility.hubId);
      if (!linkedHub?.verified) continue;
      for (const bloodType of ['O+','O-','A+','A-','B+','B-','AB+','AB-']) {
        const count=this.repository.state.units.filter(unit=>unit.facilityId===facility.id&&unit.bloodType===bloodType&&unit.status==='in_stock'&&unit.viralTestStatus==='negative'&&unit.expiryDate>today()).length;
        if (count>AUTO_REQUISITION_THRESHOLD) continue;
        const pendingAutomatic=this.repository.state.requisitions.find(request=>request.facilityId===facility.id&&request.bloodType===bloodType&&request.automated&&request.status==='awaiting_hub_review');
        if (pendingAutomatic) {
          if (pendingAutomatic.unitsRequested!==AUTO_REQUISITION_QUANTITY) {
            pendingAutomatic.unitsRequested=AUTO_REQUISITION_QUANTITY;
            this.alertEngine.add({facilityId:linkedHub.id,type:'requisition',title:'Automatic requisition updated',detail:`${facility.name} has ${count} safe ${bloodType} units; the pending automatic request is now ${AUTO_REQUISITION_QUANTITY} units.`,requestId:pendingAutomatic.id});
          }
          continue;
        }
        if (this.activeFor(facility.id,bloodType)) continue;
        const request={id:makeId('REQ'),facilityId:facility.id,staffId:null,bloodType,unitsRequested:AUTO_REQUISITION_QUANTITY,urgency:count<=2?'urgent':'routine',status:'awaiting_hub_review',requestTime:new Date().toISOString(),automated:true};
        this.repository.state.requisitions.unshift(request);
        this.alertEngine.add({facilityId:linkedHub.id,type:'requisition',title:'Automatic requisition received',detail:`${facility.name} has ${count} safe ${bloodType} units; a request for ${AUTO_REQUISITION_QUANTITY} units is awaiting hub review.`,requestId:request.id});
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
    if (!fulfillments.length) throw new Error('No dispatched units are available to receive.');
    const existingBarcodes=new Set([
      ...this.repository.state.units.map(unit=>unit.barcode.toUpperCase()),
      ...(this.repository.state.receivedContainers||[]).flatMap(item=>(item.simulationBarcodes||[]).map(entry=>entry.barcode.toUpperCase()))
    ]);
    const unitIds=fulfillments.map(item=>item.unitId);
    const container={id:makeId('CON'),requestId,facilityId:facility.id,unitIds,scannedUnitIds:[],simulationBarcodes:unitIds.map(unitId=>({unitId,barcode:makeUniqueDemoBarcode(existingBarcodes),usedAt:null})),openedAt:null,receivedAt:new Date().toISOString()};
    this.repository.state.receivedContainers.unshift(container);
    for (const item of fulfillments) {
      const unit=this.repository.state.units.find(record=>record.id===item.unitId);
      unit.facilityId=facility.id;unit.status='awaiting_scan';
      item.containerId=container.id;
      item.status='received';item.receivingTime=new Date().toISOString();
    }
    request.status='fulfilled';
    this.repository.save('requisition.received');
    return container;
  }

  find(requestId) {
    const request=this.repository.state.requisitions.find(item=>item.id===requestId);
    if (!request) throw new Error('Requisition not found.');
    return request;
  }
}