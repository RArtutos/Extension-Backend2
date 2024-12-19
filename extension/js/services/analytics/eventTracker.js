import { ANALYTICS_CONFIG } from '../../config/constants.js';
import { storage } from '../../utils/storage.js';

export class EventTracker {
  constructor() {
    this.pendingEvents = [];
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
    return event;
  }

  getPendingEvents() {
    return [...this.pendingEvents];
  }

  clearPendingEvents() {
    this.pendingEvents = [];
  }
}