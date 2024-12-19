import { EventTracker } from './eventTracker.js';
import { EventSender } from './eventSender.js';
import { storage } from '../../utils/storage.js';

class AnalyticsService {
  constructor() {
    this.eventTracker = new EventTracker();
    this.eventSender = new EventSender(this.eventTracker);
  }

  async trackPageView(domain) {
    const currentAccount = await storage.get('currentAccount');
    if (!currentAccount) return;

    await this.eventTracker.trackEvent({
      type: 'pageview',
      account_id: currentAccount.id,
      domain,
      action: 'view'
    });
  }

  async trackAccountSwitch(fromAccount, toAccount) {
    await this.eventTracker.trackEvent({
      type: 'account_switch',
      from_account_id: fromAccount?.id,
      to_account_id: toAccount.id,
      action: 'switch'
    });
  }

  async trackSessionStart(accountId, domain) {
    await this.eventTracker.trackEvent({
      type: 'session',
      account_id: accountId,
      domain,
      action: 'start'
    });
  }

  async trackSessionEnd(accountId, domain) {
    await this.eventTracker.trackEvent({
      type: 'session',
      account_id: accountId,
      domain,
      action: 'end'
    });
  }

  async trackCookieUpdate(accountId, domain) {
    await this.eventTracker.trackEvent({
      type: 'cookie_update',
      account_id: accountId,
      domain,
      action: 'update'
    });
  }

  async trackDeviceActivity(accountId, deviceId) {
    await this.eventTracker.trackEvent({
      type: 'device_activity',
      account_id: accountId,
      device_id: deviceId,
      action: 'active'
    });
  }
}

export const analyticsService = new AnalyticsService();