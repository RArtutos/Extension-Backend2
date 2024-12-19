export const ANALYTICS_CONFIG = {
  TRACKING_INTERVAL: 60000, // 1 minute
  BATCH_SIZE: 10,
  EVENTS: {
    SESSION_START: 'session_start',
    SESSION_END: 'session_end',
    PAGE_VIEW: 'page_view',
    ACCOUNT_SWITCH: 'account_switch'
  }
};