import { BLOOD_TYPES, LOW_STOCK_THRESHOLD, makeId, makeUniqueDemoBarcode, today } from '../domain/constants.js';

export class InventoryService {
  constructor(repository,auth,scanner,alertEngine,requisitionService) {
    this.repository=repository;this.auth=auth;this.scanner=scanner;this.alertEngine=alertEngine;this.requisitionService=requisitionService;
  }

  stock(facilityId,bloodType) {
    return this.repository.state.units.filter(unit=>unit.facilityId===facilityId&&(!bloodType||unit.bloodType===bloodType)&&unit.status==='in_stock'&&unit.viralTestStatus==='negative'&&unit.expiryDate>today()).length;
  }

  scanIntake(values) {
    const {staff,facility}=this.auth.require('hospital_officer');
    const barcode=this.scanner.normalize(values.barcode);
    const simulationEntry=(this.repository.state.receivedContainers||[]).flatMap(item=>item.simulationBarcodes||[]).find(entry=>entry.barcode.toUpperCase()===barcode);
    let receivedUnit;
    if (simulationEntry) {
      receivedUnit=this.repository.state.units.find(unit=>unit.id===simulationEntry.unitId&&unit.facilityId===facility.id);
      if (!receivedUnit) throw new Error('This simulation barcode is not assigned to a unit at your facility.');
      if (simulationEntry.usedAt||receivedUnit.status!=='awaiting_scan') {
        if (!simulationEntry.usedAt) {
          simulationEntry.usedAt=new Date().toISOString();
          this.repository.save('inventory.simulation_barcode_used');
        }
        throw new Error('This simulation barcode has already been used.');
      }
    } else {
      receivedUnit=this.repository.state.units.find(unit=>unit.barcode.toUpperCase()===barcode&&unit.facilityId===facility.id&&unit.status==='awaiting_scan');
    }
    if (receivedUnit) {
      const container=this.repository.state.receivedContainers.find(item=>item.facilityId===facility.id&&item.unitIds.includes(receivedUnit.id));
      if (!container) throw new Error('This received unit is not assigned to a scanning container.');
      if (simulationEntry&&container.simulationBarcodes?.find(entry=>entry.barcode===simulationEntry.barcode)!==simulationEntry) throw new Error('This simulation barcode does not belong to this container.');
      if (values.containerId&&values.containerId!==container.id) throw new Error('This unit belongs to a different received container.');
      if (!container.openedAt) throw new Error('Open the received container before scanning its units.');
      if (container.scannedUnitIds.includes(receivedUnit.id)) throw new Error('This unit has already been scanned from its container.');
      container.scannedUnitIds.push(receivedUnit.id);
      const unitBarcode=container.simulationBarcodes?.find(entry=>entry.unitId===receivedUnit.id);
      if (unitBarcode&&!unitBarcode.usedAt) unitBarcode.usedAt=new Date().toISOString();
      receivedUnit.status=receivedUnit.viralTestStatus==='negative'?'in_stock':'quarantined';
      const fulfillment=this.repository.state.fulfillments.find(item=>item.unitId===receivedUnit.id);
      this.recordEvent(receivedUnit,facility.id,staff.id,'intake',fulfillment?.id);
      this.afterStockChange();
      return receivedUnit;
    }
    if (values.containerId) throw new Error('This barcode is not an unscanned unit in this received container.');
    if (this.repository.state.units.some(unit=>unit.barcode.toUpperCase()===barcode)) throw new Error('This barcode is already registered.');
    if (!BLOOD_TYPES.includes(values.bloodType)) throw new Error('Select a valid blood group.');
    if (!values.collectionDate||!values.expiryDate||values.expiryDate<=today()||values.expiryDate<=values.collectionDate) throw new Error('Expiry must be after collection and later than today.');
    const viralTestStatus=values.viralTestStatus||'pending';
    if (viralTestStatus==='positive') throw new Error('A positive unit cannot be added to inventory. Follow the quarantine procedure.');
    const unit={id:makeId('UNT'),barcode,facilityId:facility.id,bloodType:values.bloodType,component:values.component||'Whole blood',collectionDate:values.collectionDate,expiryDate:values.expiryDate,viralTestStatus,status:viralTestStatus==='pending'?'quarantined':'in_stock'};
    this.repository.state.units.unshift(unit);
    this.recordEvent(unit,facility.id,staff.id,'intake');
    this.afterStockChange();
    return unit;
  }

  openReceivedContainer(containerId) {
    const {staff,facility}=this.auth.require('hospital_officer');
    const container=this.repository.state.receivedContainers.find(item=>item.id===containerId&&item.facilityId===facility.id);
    if (!container) throw new Error('Received container not found at your facility.');
    if (container.scannedUnitIds.length===container.unitIds.length) throw new Error('All units in this container have already been scanned.');
    if (!Array.isArray(container.simulationBarcodes)) container.simulationBarcodes=[];
    const existingBarcodes=new Set([
      ...this.repository.state.units.map(unit=>unit.barcode.toUpperCase()),
      ...(this.repository.state.receivedContainers||[]).flatMap(item=>(item.simulationBarcodes||[]).map(entry=>entry.barcode.toUpperCase()))
    ]);
    let generatedBarcodes=false;
    for (const unitId of container.unitIds) {
      if (!container.simulationBarcodes.some(entry=>entry.unitId===unitId)) {
        container.simulationBarcodes.push({unitId,barcode:makeUniqueDemoBarcode(existingBarcodes),usedAt:null});
        generatedBarcodes=true;
      }
    }
    if (!container.openedAt) {
      container.openedAt=new Date().toISOString();
      container.openedBy=staff.id;
      this.repository.save('inventory.container_opened');
    } else if (generatedBarcodes) {
      this.repository.save('inventory.container_barcodes_generated');
    }
    return container;
  }

  scanMovement(values) {
    const {staff,facility}=this.auth.require('hospital_officer');
    const barcode=this.scanner.normalize(values.barcode);
    const unit=this.repository.state.units.find(item=>item.barcode.toUpperCase()===barcode&&item.facilityId===facility.id);
    if (!unit) throw new Error('No unit with this barcode is held at your facility.');
    if (unit.status!=='in_stock') throw new Error(`This unit is ${unit.status.replace('_',' ')} and cannot be scanned again.`);
    if (unit.viralTestStatus!=='negative') throw new Error('Only units with cleared viral screening can be dispensed.');
    const type=values.eventType;
    if (!['dispense','expire'].includes(type)) throw new Error('Choose dispense or expire.');
    unit.status=type==='dispense'?'dispensed':'expired';
    this.recordEvent(unit,facility.id,staff.id,type);
    this.afterStockChange();
    return unit;
  }

  afterStockChange() {
    this.requisitionService.autoCreateLowStock();
    this.alertEngine.refresh();
    this.repository.save('inventory.updated');
  }

  recordEvent(unit,facilityId,staffId,eventType,fulfillmentId=null) {
    this.repository.state.scanEvents.unshift({id:makeId('SCN'),unitId:unit.id,facilityId,fulfillmentId,staffId,eventType,timestamp:new Date().toISOString()});
  }

  summary(facilityId) {
    const byType=Object.fromEntries(BLOOD_TYPES.map(type=>[type,this.stock(facilityId,type)]));
    return {byType,total:Object.values(byType).reduce((sum,count)=>sum+count,0),lowTypes:Object.values(byType).filter(count=>count<=LOW_STOCK_THRESHOLD).length};
  }
}