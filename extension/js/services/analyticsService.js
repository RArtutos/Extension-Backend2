import { storage } from '../utils/storage.js';
import { httpClient } from '../utils/httpClient.js';
import { ANALYTICS_CONFIG } from '../config/constants.js';

class AnalyticsService {
  constructor() {
    this.pendingEvents = [];
    this.timers = new Map();
    this.initializeTracking();
  }

  initializeTracking() {
    setInterval(() => this.sendPendingEvents(), ANALYTICS_CONFIG.TRACKING_INTERVAL);
  }

  async sendPendingEvents() {
    if (this.pendingEvents.length === 0) return;

    try {
      const events = [...this.pendingEvents];
      this.pendingEvents = [];

      const userData = await storage.get('userData');
      if (!userData?.email) return;

      await httpClient.post('/api/analytics/events/batch', {
        user_id: userData.email,
        events: events
      });
    } catch (error) {
      console.error('Error sending analytics events:', error);
      this.pendingEvents.push(...events);
    }
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
    const currentAccount = await storage.get('currentAccount');
    if (!currentAccount) return;

    await this.trackEvent({
      type: 'pageview',
      account_id: currentAccount.id,
      domain,
      action: 'view'
    });
  }

  async trackAccountSwitch(fromAccount, toAccount) {
    await this.trackEvent({
      type: 'account_switch',
      from_account_id: fromAccount?.id,
      to_account_id: toAccount.id,
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

  async trackCookieUpdate(accountId, domain) {
    await this.trackEvent({
      type: 'cookie_update',
      account_id: accountId,
      domain,
      action: 'update'
    });
  }

  async trackDeviceActivity(accountId, deviceId) {
    await this.trackEvent({
      type: 'device_activity',
      account_id: accountId,
      device_id: deviceId,
      action: 'active'
    });
  }
}

export const analyticsService = new AnalyticsService();