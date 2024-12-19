import { storage } from '../../utils/storage.js';
import { analyticsService } from '../analytics/analyticsService.js';
import { httpClient } from '../../utils/httpClient.js';

class DeviceManager {
  constructor() {
    this.deviceId = this.generateDeviceId();
  }

  generateDeviceId() {
    return `${navigator.userAgent}_${Date.now()}`;
  }

  async canAddDevice(userId) {
    try {
      const response = await httpClient.get(`/api/users/${userId}/devices`);
      const { active_devices, max_devices } = response;
      return active_devices < max_devices;
    } catch (error) {
      console.error('Error checking device limit:', error);
      return false;
    }
  }

  async registerDevice(userId, accountId) {
    if (!await this.canAddDevice(userId)) {
      throw new Error('Maximum number of devices reached');
    }

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

  async unregisterDevice(userId, accountId) {
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