import { STORAGE_KEY } from '../domain/constants.js';
import { createSeedState } from './seed.js';

export class LocalRepository {
  constructor() {
    this.channel = 'BroadcastChannel' in globalThis ? new BroadcastChannel('ubts-link-sync') : null;
    this.state = this.load();
    this.channel?.addEventListener('message', event => this.notify(event.data));
    window.addEventListener('storage', event => {
      if (event.key === STORAGE_KEY && event.newValue) this.notify({type:'inventory.sync',source:'another-tab'});
    });
  }

  load() {
    try {
      const saved=JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && Array.isArray(saved.facilities) && Array.isArray(saved.units)) return saved;
    } catch {}
    const seeded=createSeedState();
    localStorage.setItem(STORAGE_KEY,JSON.stringify(seeded));
    return seeded;
  }

  save(eventType='inventory.updated') {
    localStorage.setItem(STORAGE_KEY,JSON.stringify(this.state));
    const event={type:eventType,at:new Date().toISOString()};
    window.dispatchEvent(new CustomEvent('ubts:sync',{detail:event}));
    this.channel?.postMessage(event);
  }

  reload() {
    try {
      const saved=JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && Array.isArray(saved.units)) this.state=saved;
    } catch {}
    return this.state;
  }

  subscribe(callback) {
    const handler=event=>callback(event.detail || event.data);
    window.addEventListener('ubts:sync',handler);
    const channelHandler=event=>callback(event.data);
    this.channel?.addEventListener('message',channelHandler);
    return () => {
      window.removeEventListener('ubts:sync',handler);
      this.channel?.removeEventListener('message',channelHandler);
    };
  }

  notify(event) {
    if (event?.source==='another-tab') this.reload();
    window.dispatchEvent(new CustomEvent('ubts:sync',{detail:event}));
  }
}