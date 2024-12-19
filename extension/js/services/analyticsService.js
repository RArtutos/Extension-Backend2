import { httpClient } from '../utils/httpClient.js';
import { storage } from '../utils/storage.js';
import { ANALYTICS_CONFIG, STORAGE_KEYS } from '../config/index.js';

class AnalyticsService {
  constructor() {
    this.pendingEvents = [];
    this.initializeTracking();
  }

  initializeTracking() {
    setInterval(() => this.sendPendingEvents(), ANALYTICS_CONFIG.TRACKING_INTERVAL);
  }

  async trackEvent(eventData) {
    const userData = await storage.get(STORAGE_KEYS.USER_DATA);
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

  async trackSessionStart(accountId, domain) {
    return this.trackEvent({
      account_id: accountId,
      action: ANALYTICS_CONFIG.EVENTS.SESSION_START,
      domain
    });
  }

  async trackSessionEnd(accountId, domain) {
    return this.trackEvent({
      account_id: accountId,
      action: ANALYTICS_CONFIG.EVENTS.SESSION_END,
      domain
    });
  }

  async trackPageView(domain) {
    const currentAccount = await storage.get(STORAGE_KEYS.CURRENT_ACCOUNT);
    if (!currentAccount) return;

    return this.trackEvent({
      account_id: currentAccount.id,
      action: ANALYTICS_CONFIG.EVENTS.PAGE_VIEW,
      domain
    });
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