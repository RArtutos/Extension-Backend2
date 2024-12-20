import { accountService } from './services/accountService.js';
import { sessionService } from './services/sessionService.js';
import { cookieManager } from './utils/cookie/cookieManager.js';
import { storage } from './utils/storage.js';

class AccountManager {
  constructor() {
    this.currentAccount = null;
    this.initializeEventListeners();
  }

  initializeEventListeners() {
    // Monitor tab closures
    chrome.tabs.onRemoved.addListener(async (tabId) => {
      await this.handleTabClose(tabId);
    });

    // Monitor browser close
    chrome.runtime.onSuspend.addListener(async () => {
      await this.cleanupCurrentSession();
    });
  }

  async switchAccount(account) {
    try {
      // End current session if exists
      if (this.currentAccount) {
        await sessionService.endSession(this.currentAccount.id);
      }

      // Start new session
      const domain = this.getFirstDomain(account);
      if (domain) {
        await sessionService.startSession(account.id, domain);
        await cookieManager.setAccountCookies(account);
        
        // Store current account
        await storage.set('currentAccount', account);
        this.currentAccount = account;

        // Open domain in new tab
        chrome.tabs.create({ url: `https://${domain}` });
      }

      return true;
    } catch (error) {
      console.error('Error switching account:', error);
      throw error;
    }
  }

  async handleTabClose(tabId) {
    try {
      const currentAccount = await storage.get('currentAccount');
      if (!currentAccount) return;

      const tabs = await chrome.tabs.query({});
      const accountDomains = currentAccount.cookies.map(c => c.domain.replace(/^\./, ''));
      
      // Check if any domain is still open
      const hasOpenTabs = tabs.some(tab => {
        if (!tab.url) return false;
        const tabDomain = new URL(tab.url).hostname;
        return accountDomains.some(domain => 
          tabDomain === domain || tabDomain.endsWith('.' + domain)
        );
      });

      if (!hasOpenTabs) {
        await this.cleanupCurrentSession();
      }
    } catch (error) {
      console.error('Error handling tab close:', error);
    }
  }

  async cleanupCurrentSession() {
    try {
      const currentAccount = await storage.get('currentAccount');
      if (currentAccount) {
        await sessionService.endSession(currentAccount.id);
        await cookieManager.removeAccountCookies(currentAccount);
        await storage.remove('currentAccount');
        this.currentAccount = null;
      }
    } catch (error) {
      console.error('Error cleaning up session:', error);
    }
  }

  getFirstDomain(account) {
    if (!account?.cookies?.length) return null;
    const domain = account.cookies[0].domain;
    return domain.startsWith('.') ? domain.substring(1) : domain;
  }
}

export const accountManager = new AccountManager();