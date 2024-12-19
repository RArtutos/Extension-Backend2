import { SESSION_CONFIG } from '../../config/constants.js';
import { storage } from '../../utils/storage.js';
import { analyticsService } from '../analytics/analyticsService.js';
import { deviceManager } from '../device/deviceManager.js';
import { SessionValidator } from './sessionValidator.js';

class SessionManager {
  constructor() {
    this.validator = new SessionValidator();
    this.pollInterval = null;
  }

  async startSession(accountId, domain) {
    try {
      // Validar sesión y dispositivos
      await this.validator.validateSession(accountId);
      
      // Registrar dispositivo
      await deviceManager.registerDevice(accountId);
      
      // Iniciar tracking
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
        await this.validator.validateSession(accountId);
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