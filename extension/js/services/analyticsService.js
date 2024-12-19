import { httpClient } from '../utils/httpClient.js';
import { storage } from '../utils/storage.js';
import { ANALYTICS_CONFIG } from '../config/constants.js';

class AnalyticsService {
  constructor() {
    this.pendingEvents = [];
    this.initializeTracking();
  }

  initializeTracking() {
    setInterval(() => this.sendPendingEvents(), ANALYTICS_CONFIG.TRACKING_INTERVAL);
  }

  async trackEvent(eventData) {
    const userData = await storage.get('userData');
    if (!userData?.email) return;

    const event = {
      ...eventData,
      user_id: userData.email,
      ip_address: await this.getIpAddress(),
      user_agent: navigator.userAgent,
      timestamp: new Date().toISOString()
    };

    this.pendingEvents.push(event);

    if (this.pendingEvents.length >= ANALYTICS_CONFIG.BATCH_SIZE) {
      await this.sendPendingEvents();
    }
  }

  async sendPendingEvents() {
    if (this.pendingEvents.length === 0) return;

    try {
      const events = [...this.pendingEvents];
      this.pendingEvents = [];

      await httpClient.post('/api/analytics/events/batch', events);
    } catch (error) {
      console.error('Error sending analytics events:', error);
      this.pendingEvents.push(...events);
    }
  }

  async getIpAddress() {
    try {
      const response = await fetch('https://api.ipify.org?format=json');
      const data = await response.json();
      return data.ip;
    } catch (error) {
      return '0.0.0.0';
    }
  }
}

export const analyticsService = new AnalyticsService();