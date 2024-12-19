import { storage } from './storage.js';
import { STORAGE_KEYS } from '../config/constants.js';

class DeviceManager {
  async getDeviceId() {
    let deviceId = await storage.get(STORAGE_KEYS.DEVICE_ID);
    if (!deviceId) {
      deviceId = this.generateDeviceId();
      await storage.set(STORAGE_KEYS.DEVICE_ID, deviceId);
    }
    return deviceId;
  }

  generateDeviceId() {
    return 'device_' + Math.random().toString(36).substr(2, 9);
  }
}

export const deviceManager = new DeviceManager();