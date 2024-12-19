import { httpClient } from '../utils/httpClient.js';
import { storage } from '../utils/storage.js';
import { deviceManager } from '../utils/deviceManager.js';
import { analyticsService } from './analyticsService.js';
import { STORAGE_KEYS } from '../config/constants.js';

class SessionService {
  constructor() {
    this.heartbeatInterval = null;
    this.HEARTBEAT_INTERVAL = 60000; // 1 minuto
  }

  async startSession(accountId, domain) {
    try {
      const deviceId = await deviceManager.getDeviceId();
      const sessionData = {
        account_id: accountId,
        device_id: deviceId,
        ip_address: await this.getIpAddress(),
        user_agent: navigator.userAgent,
        domain: domain
      };

      const response = await httpClient.post('/api/sessions', sessionData);
      await storage.set('currentSession', response);
      
      // Iniciar heartbeat
      this.startHeartbeat(response.id);

      await analyticsService.trackEvent({
        account_id: accountId,
        action: 'session_start',
        domain: domain
      });

      return response;
    } catch (error) {
      console.error('Error starting session:', error);
      throw error;
    }
  }

  async endSession() {
    try {
      const currentSession = await storage.get('currentSession');
      if (!currentSession) return;

      // Detener heartbeat
      this.stopHeartbeat();

      await httpClient.delete(`/api/sessions/${currentSession.id}`);
      await storage.remove('currentSession');

      await analyticsService.trackEvent({
        account_id: currentSession.account_id,
        action: 'session_end',
        domain: currentSession.domain
      });
    } catch (error) {
      console.error('Error ending session:', error);
      throw error;
    }
  }

  startHeartbeat(sessionId) {
    this.stopHeartbeat(); // Limpiar intervalo existente si lo hay
    
    this.heartbeatInterval = setInterval(async () => {
      try {
        await httpClient.post(`/api/sessions/${sessionId}/heartbeat`);
      } catch (error) {
        console.error('Heartbeat failed:', error);
        if (error.response?.status === 404) {
          this.stopHeartbeat();
        }
      }
    }, this.HEARTBEAT_INTERVAL);
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  async getSessionInfo(accountId) {
    try {
      return await httpClient.get(`/api/accounts/${accountId}/session`);
    } catch (error) {
      console.error('Error getting session info:', error);
      throw error;
    }
  }

  async getIpAddress() {
    try {
      const response = await fetch('https://api.ipify.org?format=json');
      const data = await response.json();
      return data.ip;
    } catch (error) {
      console.error('Error getting IP address:', error);
      return '0.0.0.0';
    }
  }
}

export const sessionService = new SessionService();
