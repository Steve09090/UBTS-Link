import { BLOOD_TYPES, LOW_STOCK_THRESHOLD, makeId, today } from '../domain/constants.js';

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
    if (!BLOOD_TYPES.includes(values.bloodType)) throw new Error('Select a valid blood group.');
    if (this.repository.state.units.some(unit=>unit.barcode.toUpperCase()===barcode)) throw new Error('This barcode is already registered.');
    if (!values.collectionDate||!values.expiryDate||values.expiryDate<=today()||values.expiryDate<=values.collectionDate) throw new Error('Expiry must be after collection and later than today.');
    const viralTestStatus=values.viralTestStatus||'pending';
    if (viralTestStatus==='positive') throw new Error('A positive unit cannot be added to inventory. Follow the quarantine procedure.');
    const unit={id:makeId('UNT'),barcode,facilityId:facility.id,bloodType:values.bloodType,component:values.component||'Whole blood',collectionDate:values.collectionDate,expiryDate:values.expiryDate,viralTestStatus,status:viralTestStatus==='pending'?'quarantined':'in_stock'};
    this.repository.state.units.unshift(unit);
    this.recordEvent(unit,facility.id,staff.id,'intake');
    this.afterStockChange();
    return unit;
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

  recordEvent(unit,facilityId,staffId,eventType) {
    this.repository.state.scanEvents.unshift({id:makeId('SCN'),unitId:unit.id,facilityId,fulfillmentId:null,staffId,eventType,timestamp:new Date().toISOString()});
  }

  summary(facilityId) {
    const byType=Object.fromEntries(BLOOD_TYPES.map(type=>[type,this.stock(facilityId,type)]));
    return {byType,total:Object.values(byType).reduce((sum,count)=>sum+count,0),lowTypes:Object.values(byType).filter(count=>count<=LOW_STOCK_THRESHOLD).length};
  }
}