import { SESSION_CONFIG } from '../config/constants.js';
import { storage } from '../utils/storage.js';
import { httpClient } from '../utils/httpClient.js';
import { cookieManager } from '../utils/cookie/cookieManager.js';
import { analyticsService } from './analyticsService.js';
import { deviceManager } from './deviceManager.js';

class SessionManager {
  constructor() {
    this.pollInterval = null;
  }

  async startSession(accountId, domain) {
    try {
      // Verificar límites de dispositivos y sesiones
      const userData = await storage.get('userData');
      if (!userData) {
        throw new Error('No user data found');
      }

      // Verificar límite de dispositivos
      const deviceResponse = await httpClient.get(`/api/users/${userData.email}/devices`);
      if (deviceResponse.active_devices >= deviceResponse.max_devices) {
        throw new Error('Maximum number of devices reached');
      }

      // Verificar límite de sesiones concurrentes
      const sessionInfo = await httpClient.get(`/api/accounts/${accountId}/session`);
      if (sessionInfo.active_sessions >= sessionInfo.max_concurrent_users) {
        throw new Error('Maximum concurrent users reached');
      }

      // Registrar dispositivo y sesión
      await deviceManager.registerDevice(userData.email, accountId);
      await analyticsService.trackSessionStart(accountId, domain);
      
      this.startPolling(accountId);
      return true;
    } catch (error) {
      console.error('Error starting session:', error);
      throw error;
    }
  }

  async endSession(accountId) {
    try {
      const currentAccount = await storage.get('currentAccount');
      if (currentAccount?.id === accountId) {
        const domain = this.getAccountDomain(currentAccount);
        await analyticsService.trackSessionEnd(accountId, domain);
        await deviceManager.unregisterDevice(accountId);
        this.stopPolling();
      }
      return true;
    } catch (error) {
      console.error('Error ending session:', error);
      return false;
    }
  }

  startPolling(accountId) {
    if (this.pollInterval) return;
    
    this.pollInterval = setInterval(async () => {
      try {
        const sessionInfo = await httpClient.get(`/api/accounts/${accountId}/session`);
        if (sessionInfo.active_sessions > sessionInfo.max_concurrent_users) {
          await this.cleanupCurrentSession();
        }
      } catch (error) {
        await this.cleanupCurrentSession();
      }
    }, SESSION_CONFIG.REFRESH_INTERVAL);
  }

  stopPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  async cleanupCurrentSession() {
    const currentAccount = await storage.get('currentAccount');
    if (currentAccount) {
      await this.endSession(currentAccount.id);
      await storage.remove('currentAccount');
    }
    this.stopPolling();
  }

  getAccountDomain(account) {
    if (!account?.cookies?.length) return '';
    const domain = account.cookies[0].domain;
    return domain.startsWith('.') ? domain.substring(1) : domain;
  }
}

export const sessionManager = new SessionManager();