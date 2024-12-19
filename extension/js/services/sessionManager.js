import { SESSION_CONFIG } from '../config/constants.js';
import { storage } from '../utils/storage.js';
import { httpClient } from '../utils/httpClient.js';
import { cookieManager } from '../utils/cookie/cookieManager.js';
import { analyticsService } from './analyticsService.js';
import { deviceManager } from './deviceManager.js';
import { deviceService } from './device/deviceService.js';


export class SessionManager {
  constructor() {
    this.pollInterval = null;
  }

  async updateSessionStatus(accountId, domain = null) {
    try {
      // Get current session info
      const sessionInfo = await httpClient.get(`/api/accounts/${accountId}/session`);
      
      // Check if we've exceeded concurrent user limit
      if (sessionInfo.active_sessions > sessionInfo.max_concurrent_users) {
        throw new Error('Session limit reached');
      }

      // Update session activity if domain is provided
      if (domain) {
        await httpClient.put(`/api/sessions/${accountId}`, { domain });
        await analyticsService.trackPageView(domain);
      }

      return sessionInfo;
    } catch (error) {
      console.error('Error updating session status:', error);
      throw error;
    }
  }

  async startSession(accountId, domain) {
    try {
      // Verify session and device limits
      await this.updateSessionStatus(accountId);
      
      // Register device
      const userData = await storage.get('userData');
      if (!userData) {
        throw new Error('No user data found');
      }

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
        await this.updateSessionStatus(accountId);
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
