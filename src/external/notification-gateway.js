import { makeId } from '../domain/constants.js';

export class NotificationGateway {
  constructor(repository) { this.repository=repository; }
  send(alert) {
    this.repository.state.outbox.unshift({id:makeId('MSG'),alertId:alert.id,facilityId:alert.facilityId,channel:'demo',status:'queued',createdAt:new Date().toISOString()});
    return {queued:true,channel:'demo'};
  }
}