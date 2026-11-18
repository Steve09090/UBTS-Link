import { BLOOD_TYPES, LOW_STOCK_THRESHOLD, makeId, shiftDate, today } from '../domain/constants.js';

export class AlertEngine {
  constructor(repository,notificationGateway) {
    this.repository=repository;
    this.notificationGateway=notificationGateway;
  }

  add(data) {
    const alert={id:makeId('ALT'),facilityId:data.facilityId,type:data.type,title:data.title,detail:data.detail,requestId:data.requestId||null,createdAt:new Date().toISOString(),resolvedAt:null};
    this.repository.state.alerts.unshift(alert);
    this.notificationGateway.send(alert);
    return alert;
  }

  refresh() {
    const state=this.repository.state;
    const activeKeys=new Set();
    for (const unit of state.units.filter(item=>item.status==='in_stock'&&item.expiryDate<=today())) {
      unit.status='expired';
      state.scanEvents.unshift({id:makeId('SCN'),unitId:unit.id,facilityId:unit.facilityId,fulfillmentId:null,staffId:null,eventType:'expire',timestamp:new Date().toISOString(),automatic:true});
    }
    for (const facility of state.facilities.filter(item=>item.type==='Hospital'&&item.verified)) {
      for (const bloodType of BLOOD_TYPES) {
        const count=state.units.filter(unit=>unit.facilityId===facility.id&&unit.bloodType===bloodType&&unit.status==='in_stock'&&unit.viralTestStatus==='negative'&&unit.expiryDate>today()).length;
        if (count<=LOW_STOCK_THRESHOLD) {
          const key=`low_stock:${facility.id}:${bloodType}`;activeKeys.add(key);
          this.ensureActive(key,()=>this.add({facilityId:facility.id,type:'low_stock',title:`Low ${bloodType} stock`,detail:`${count} eligible units remain at ${facility.name}.`}));
        }
      }
    }
    for (const unit of state.units.filter(item=>item.status==='in_stock'&&item.expiryDate<=shiftDate(7))) {
      const key=`expiry:${unit.id}`;activeKeys.add(key);
      const facility=state.facilities.find(item=>item.id===unit.facilityId);
      this.ensureActive(key,()=>this.add({facilityId:unit.facilityId,type:'expiry',title:`Unit expires ${unit.expiryDate<=today()?'today':'soon'}`,detail:`${unit.barcode} · ${unit.bloodType} · ${facility?.name||'Unknown facility'}.`}));
    }
    for (const unit of state.units.filter(item=>item.status==='expired'&&item.expiryDate<=today())) {
      const key=`expiry:${unit.id}`;activeKeys.add(key);
      const facility=state.facilities.find(item=>item.id===unit.facilityId);
      this.ensureActive(key,()=>this.add({facilityId:unit.facilityId,type:'expiry',title:'Unit expired',detail:`${unit.barcode} · ${unit.bloodType} · ${facility?.name||'Unknown facility'}.`}));
    }
    for (const alert of state.alerts) if (alert.key&&!activeKeys.has(alert.key)&&!alert.resolvedAt) alert.resolvedAt=new Date().toISOString();
    this.repository.save('alerts.refreshed');
  }

  ensureActive(key,create) {
    const current=this.repository.state.alerts.find(alert=>alert.key===key&&!alert.resolvedAt);
    if (!current) {
      const alert=create();
      alert.key=key;
    }
  }
}