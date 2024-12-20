import { httpClient } from '../utils/httpClient.js';
import { storage } from '../utils/storage.js';
import { SESSION_CONFIG } from '../config/constants.js';
import { analyticsService } from './analyticsService.js';

class SessionService {
  constructor() {
    this.activeTimers = new Map();
  }

  async startSession(accountId, domain) {
    try {
      // Verificar y registrar acceso
      const response = await httpClient.get(`/api/accounts/${accountId}/access?domain=${domain}`);
      
      if (response.active_users >= response.max_users) {
        throw new Error(`Maximum concurrent users (${response.max_users}) reached`);
      }

      this.startInactivityTimer(domain, accountId);
      return true;
    } catch (error) {
      console.error('Error starting session:', error);
      throw error;
    }
  }

  async endSession(accountId) {
    try {
      await httpClient.post(`/api/accounts/${accountId}/logout`);
      this.clearAllTimers();
      return true;
    } catch (error) {
      console.error('Error ending session:', error);
      return false;
    }
  }

  startInactivityTimer(domain, accountId) {
    this.clearInactivityTimer(domain);
    const timer = setTimeout(
      () => this.handleInactivity(domain, accountId),
      SESSION_CONFIG.INACTIVITY_TIMEOUT
    );
    this.activeTimers.set(domain, timer);
  }

  clearInactivityTimer(domain) {
    if (this.activeTimers.has(domain)) {
      clearTimeout(this.activeTimers.get(domain));
      this.activeTimers.delete(domain);
    }
  }

  clearAllTimers() {
    this.activeTimers.forEach(timer => clearTimeout(timer));
    this.activeTimers.clear();
  }

  async handleInactivity(domain, accountId) {
    this.clearInactivityTimer(domain);
    await this.endSession(accountId);
  }
}

export const sessionService = new SessionService();