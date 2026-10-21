export class SyncEngine {
  constructor(repository,onSync) { this.repository=repository;this.onSync=onSync;this.unsubscribe=null; }
  start() { this.unsubscribe=this.repository.subscribe(event=>this.onSync(event)); }
  stop() { this.unsubscribe?.(); }
  publish(eventType) { this.repository.save(eventType); }
}