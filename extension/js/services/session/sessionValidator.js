import { deviceManager } from '../device/deviceManager.js';
import { storage } from '../../utils/storage.js';
import { httpClient } from '../../utils/httpClient.js';

export class SessionValidator {
  async validateSession(accountId) {
    try {
      const userData = await storage.get('userData');
      if (!userData) {
        throw new Error('No user data found');
      }

      // Verificar límite de dispositivos
      if (!await deviceManager.canAddDevice(userData.email)) {
        throw new Error('Maximum number of devices reached');
      }

      // Verificar límite de sesiones concurrentes
      const sessionInfo = await httpClient.get(`/api/accounts/${accountId}/session`);
      if (sessionInfo.active_sessions >= sessionInfo.max_concurrent_users) {
        throw new Error('Maximum concurrent users reached');
      }

      return true;
    } catch (error) {
      console.error('Session validation failed:', error);
      throw error;
    }
  }
}