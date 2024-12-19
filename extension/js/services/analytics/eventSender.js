import { httpClient } from '../../utils/httpClient.js';
import { ANALYTICS_CONFIG } from '../../config/constants.js';

export class EventSender {
  constructor(eventTracker) {
    this.eventTracker = eventTracker;
    this.initializeTracking();
  }

  initializeTracking() {
    setInterval(() => this.sendPendingEvents(), ANALYTICS_CONFIG.TRACKING_INTERVAL);
  }

  async sendPendingEvents() {
    const events = this.eventTracker.getPendingEvents();
    if (events.length === 0) return;

    try {
      await httpClient.post('/api/analytics/events/batch', { events });
      this.eventTracker.clearPendingEvents();
    } catch (error) {
      console.error('Error sending analytics events:', error);
    }
  }
}