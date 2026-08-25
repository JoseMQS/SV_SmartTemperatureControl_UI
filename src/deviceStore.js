const { EventEmitter } = require('events');
const { config } = require('./config');

/**
 * Guarda o estado mais recente de cada device e emite eventos:
 *  - 'update'        (id, state)            sempre que chega uma mensagem nova
 *  - 'status-change'  (id, online: bool)      quando um device fica online/offline
 *  - 'threshold-cross' (id, temp)             quando a temperatura ultrapassa o limiar
 */
class DeviceStore extends EventEmitter {
  constructor() {
    super();
    this.devices = new Map();
    for (const id of config.deviceIds) {
      this.devices.set(id, {
        id,
        current_temperature: null,
        temperature_set: null,
        temperature_delta: null,
        valve_state: null,
        lastSeen: 0,
        online: false,
      });
    }
  }

  snapshot() {
    return Array.from(this.devices.values());
  }

  get(id) {
    return this.devices.get(id);
  }

  update(id, data) {
    let dev = this.devices.get(id);
    if (!dev) {
      dev = { id, current_temperature: null, temperature_set: null, temperature_delta: null, valve_state: null, lastSeen: 0, online: false };
      this.devices.set(id, dev);
    }

    const wasOnline = dev.online;
    const prevTemp = dev.current_temperature;

    dev.lastSeen = Date.now();
    dev.online = true;
    if (typeof data.current_temperature !== 'undefined') dev.current_temperature = Number(data.current_temperature);
    if (typeof data.temperature_set !== 'undefined') dev.temperature_set = Number(data.temperature_set);
    if (typeof data.temperature_delta !== 'undefined') dev.temperature_delta = Number(data.temperature_delta);
    if (typeof data.valve_state !== 'undefined') dev.valve_state = data.valve_state === true || data.valve_state === 'true';

    this.emit('update', id, dev);

    if (!wasOnline) this.emit('status-change', id, true);

    const threshold = config.tempAlertThreshold;
    const crossedUp = prevTemp !== null && prevTemp <= threshold && dev.current_temperature > threshold;
    if (crossedUp) this.emit('threshold-cross', id, dev.current_temperature);
  }

  /** Corre periodicamente para detetar devices que deixaram de publicar */
  checkOffline() {
    const now = Date.now();
    for (const dev of this.devices.values()) {
      if (dev.online && dev.lastSeen && now - dev.lastSeen > config.offlineMs) {
        dev.online = false;
        this.emit('status-change', dev.id, false);
        this.emit('update', dev.id, dev);
      }
    }
  }
}

module.exports = new DeviceStore();
