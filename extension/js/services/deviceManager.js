import { storage } from '../utils/storage.js';
import { analyticsService } from './analyticsService.js';
import { httpClient } from '../utils/httpClient.js';

class DeviceManager {
  constructor() {
    this.deviceId = this.generateDeviceId();
  }

  generateDeviceId() {
    return `${navigator.userAgent}_${Date.now()}`;
  }

  async registerDevice(userId, accountId) {
    try {
      await httpClient.post('/api/devices/register', {
        user_id: userId,
        device_id: this.deviceId,
        account_id: accountId
      });

      await analyticsService.trackDeviceActivity(accountId, this.deviceId);
      return true;
    } catch (error) {
      console.error('Error registering device:', error);
      throw error;
    }
  }

  async unregisterDevice(accountId) {
    try {
      await httpClient.delete(`/api/devices/${this.deviceId}`);
      await analyticsService.trackDeviceActivity(accountId, this.deviceId);
      return true;
    } catch (error) {
      console.error('Error unregistering device:', error);
      return false;
    }
  }

  getDeviceId() {
    return this.deviceId;
  }
}

export const deviceManager = new DeviceManager();