import { httpClient } from '../utils/httpClient.js';
import { storage } from '../utils/storage.js';
import { sessionService } from './sessionService.js';
import { cookieManager } from '../utils/cookie/cookieManager.js';
import { analyticsService } from './analyticsService.js';
import { STORAGE_KEYS } from '../config/constants.js';

class AccountService {
  async getCurrentAccount() {
    return await storage.get(STORAGE_KEYS.CURRENT_ACCOUNT);
  }

  async getAccounts() {
    try {
      const response = await httpClient.get('/api/accounts');
      return response || [];
    } catch (error) {
      console.error('Error fetching accounts:', error);
      throw new Error('Failed to fetch accounts');
    }
  }

  async switchAccount(account) {
    try {
      // Verify session limits
      const sessionInfo = await sessionService.getSessionInfo(account.id);
      if (sessionInfo.active_sessions >= sessionInfo.max_concurrent_users) {
        throw new Error(`Maximum concurrent users (${sessionInfo.max_concurrent_users}) reached`);
      }

      // End current session if exists
      await sessionService.endSession();

      // Remove current cookies
      const currentAccount = await this.getCurrentAccount();
      if (currentAccount) {
        await cookieManager.removeAccountCookies(currentAccount);
      }

      // Set new cookies
      await cookieManager.setAccountCookies(account);

      // Start new session
      const domain = this.getAccountDomain(account);
      if (domain) {
        await sessionService.startSession(account.id, domain);
        await analyticsService.trackEvent({
          account_id: account.id,
          action: 'account_switch',
          domain: domain
        });
      }

      await storage.set(STORAGE_KEYS.CURRENT_ACCOUNT, account);
      return true;
    } catch (error) {
      console.error('Error switching account:', error);
      throw error;
    }
  }

  getAccountDomain(account) {
    if (!account?.cookies?.length) return null;
    const domain = account.cookies[0].domain;
    return domain.startsWith('.') ? domain.substring(1) : domain;
  }
}

export const accountService = new AccountService();