import { BLOOD_TYPES, shiftDate } from '../domain/constants.js';

export function createSeedState() {
  const facilities = [
    {id:'FAC-001',name:'Kampala Regional Hospital',type:'Hospital',district:'Kampala',verified:true,hubId:'FAC-003'},
    {id:'FAC-002',name:'Mukono General Hospital',type:'Hospital',district:'Mukono',verified:true,hubId:'FAC-003'},
    {id:'FAC-003',name:'Central Region UBTS Hub',type:'UBTS Hub',district:'Kampala',verified:true},
    {id:'FAC-004',name:'Jinja Referral Hospital',type:'Hospital',district:'Jinja',verified:false,hubId:'FAC-003'}
  ];
  const staff = [
    {id:'STF-001',facilityId:'FAC-001',name:'K. Mutesi',role:'hospital_officer',verified:true},
    {id:'STF-002',facilityId:'FAC-001',name:'A. Nambasa',role:'clinician',verified:true},
    {id:'STF-003',facilityId:'FAC-003',name:'D. Okello',role:'hub_staff',verified:true},
    {id:'STF-004',facilityId:'FAC-003',name:'System Administrator',role:'system_admin',verified:true},
    {id:'STF-005',facilityId:'FAC-004',name:'J. Wekesa',role:'hospital_officer',verified:false},
    {id:'STF-006',facilityId:'FAC-002',name:'M. Kato',role:'clinician',verified:true}
  ];
  const counts = {
    'FAC-001':{'O+':13,'O-':5,'A+':10,'A-':4,'B+':8,'B-':3,'AB+':7,'AB-':5},
    'FAC-002':{'O+':9,'O-':4,'A+':8,'A-':3,'B+':6,'B-':2,'AB+':4,'AB-':2},
    'FAC-003':{'O+':30,'O-':18,'A+':24,'A-':14,'B+':17,'B-':10,'AB+':12,'AB-':8},
    'FAC-004':{'O+':6,'O-':2,'A+':5,'A-':1,'B+':4,'B-':1,'AB+':2,'AB-':1}
  };
  const units=[];
  for (const [facilityId,types] of Object.entries(counts)) {
    let serial=0;
    for (const [bloodType,count] of Object.entries(types)) {
      for (let index=0;index<count;index++) {
        serial++;
        const days=index<2?index+3:12+(index*3)%34;
        units.push({
          id:`UNT-${facilityId.slice(-3)}-${String(serial).padStart(4,'0')}`,
          barcode:`IST128-26-${facilityId.slice(-3)}-${String(serial).padStart(4,'0')}`,
          facilityId,bloodType,component:'Whole blood',collectionDate:shiftDate(-6-index%18),
          expiryDate:shiftDate(days),viralTestStatus:'negative',status:'in_stock'
        });
      }
    }
  }
  return {
    facilities,staff,units,requisitions:[
      {id:'REQ-2026-0041',facilityId:'FAC-001',staffId:'STF-002',bloodType:'O-',unitsRequested:4,urgency:'urgent',status:'awaiting_facility_review',requestTime:new Date(Date.now()-32*60000).toISOString()},
      {id:'REQ-2026-0042',facilityId:'FAC-002',staffId:'STF-006',bloodType:'A+',unitsRequested:3,urgency:'routine',status:'awaiting_hub_review',requestTime:new Date(Date.now()-85*60000).toISOString()}
    ],fulfillments:[],scanEvents:[],alerts:[],outbox:[]
  };
}