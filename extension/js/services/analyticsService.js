import { ANALYTICS_CONFIG } from '../config/constants.js';
import { storage } from '../utils/storage.js';
import { httpClient } from '../utils/httpClient.js';

class AnalyticsService {
  constructor() {
    this.pendingEvents = [];
    this.timers = new Map();
    this.initializeTracking();
  }

  async initializeTracking() {
    setInterval(() => this.sendPendingEvents(), ANALYTICS_CONFIG.TRACKING_INTERVAL);
  }

  async sendPendingEvents() {
    if (this.pendingEvents.length === 0) return;

    try {
      const events = [...this.pendingEvents];
      this.pendingEvents = [];

      const userData = await storage.get('userData');
      if (!userData?.email) return;

      await httpClient.post(`/api/analytics/events/batch`, {
        user_id: userData.email,
        events: events
      });
    } catch (error) {
      console.error('Error sending analytics events:', error);
      this.pendingEvents.push(...events);
    }
  }

  resetTimer(domain) {
    if (this.timers.has(domain)) {
      clearTimeout(this.timers.get(domain));
    }
    
    const timer = setTimeout(() => {
      this.trackPageView(domain);
    }, ANALYTICS_CONFIG.TRACKING_INTERVAL);
    
    this.timers.set(domain, timer);
  }

  async trackEvent(eventData) {
    const userData = await storage.get('userData');
    if (!userData?.email) return;

    const event = {
      ...eventData,
      user_id: userData.email,
      timestamp: new Date().toISOString()
    };

    this.pendingEvents.push(event);

    if (this.pendingEvents.length >= ANALYTICS_CONFIG.BATCH_SIZE) {
      await this.sendPendingEvents();
    }
  }

  async trackPageView(domain) {
    await this.trackEvent({
      type: 'pageview',
      domain,
      action: 'view'
    });
  }

  async trackAccountSwitch(fromAccount, toAccount) {
    await this.trackEvent({
      type: 'account_switch',
      from: fromAccount?.id,
      to: toAccount.id,
      action: 'switch'
    });
  }

  async trackSessionStart(accountId, domain) {
    await this.trackEvent({
      type: 'session',
      account_id: accountId,
      domain,
      action: 'start'
    });
  }

  async trackSessionEnd(accountId, domain) {
    await this.trackEvent({
      type: 'session',
      account_id: accountId,
      domain,
      action: 'end'
    });
  }

  async cleanupDomainAnalytics(domain) {
    try {
      const userData = await storage.get('userData');
      if (!userData?.email) return;

      await httpClient.delete(`/api/analytics/domain/${encodeURIComponent(domain)}`);
    } catch (error) {
      console.error('Error cleaning up domain analytics:', error);
    }
  }
}

export const analyticsService = new AnalyticsService();
