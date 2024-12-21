import { accountService } from './services/accountService.js';
import { sessionService } from './services/sessionService.js';
import { cookieManager } from './utils/cookie/cookieManager.js';
import { analyticsService } from './services/analyticsService.js';
import { ui } from './utils/ui.js';
import { storage } from './utils/storage.js';

class AccountManager {
  constructor() {
    this.currentAccount = null;
    this.initializeEventListeners();
  }

  initializeEventListeners() {
    // Monitor tab activity
    chrome.tabs.onActivated.addListener(async (activeInfo) => {
      const tab = await chrome.tabs.get(activeInfo.tabId);
      if (tab.url) {
        const domain = new URL(tab.url).hostname;
        await this.handleTabActivity(domain);
      }
    });

    // Monitor URL changes
    chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
      if (changeInfo.url) {
        const domain = new URL(changeInfo.url).hostname;
        await this.handleTabActivity(domain);
      }
    });

    // Monitor browser close
    chrome.runtime.onSuspend.addListener(async () => {
      await this.cleanupCurrentSession();
    });

    // Monitor tab close
    chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
      await this.handleTabClose(tabId);
    });
  }

  async handleTabActivity(domain) {
    const currentAccount = await storage.get('currentAccount');
    if (!currentAccount) return;

    try {
      await sessionService.getSessionInfo(currentAccount.id);
      await analyticsService.trackPageView(domain);
    } catch (error) {
      console.error('Error handling tab activity:', error);
      if (error.message.includes('Session limit reached')) {
        await this.cleanupCurrentSession();
        ui.showError('Session expired: maximum concurrent users reached');
      }
    }
  }

  async handleTabClose(tabId) {
    const currentAccount = await storage.get('currentAccount');
    if (!currentAccount) return;

    try {
      const tabs = await chrome.tabs.query({});
      const accountDomains = currentAccount.cookies.map(c => c.domain);
      
      const hasOpenTabs = tabs.some(tab => {
        if (!tab.url) return false;
        const domain = new URL(tab.url).hostname;
        return accountDomains.some(accDomain => 
          domain === accDomain || domain.endsWith('.' + accDomain.replace(/^\./, '')));
      });

      if (!hasOpenTabs) {
        await this.cleanupCurrentSession();
      }
    } catch (error) {
      console.error('Error handling tab close:', error);
    }
  }

  async switchAccount(account) {
    try {
      const currentAccount = await storage.get('currentAccount');
      
      // Si hay una cuenta actual, verificar si comparten dominio
      if (currentAccount) {
        const currentDomains = currentAccount.cookies.map(c => c.domain);
        const newDomains = account.cookies.map(c => c.domain);
        const sharedDomain = currentDomains.some(d => newDomains.includes(d));

        if (sharedDomain) {
          await sessionService.switchSession(currentAccount.id, account.id, newDomains[0]);
        } else {
          await this.cleanupCurrentSession();
          await sessionService.startSession(account.id, newDomains[0]);
        }
      } else {
        await sessionService.startSession(account.id, account.cookies[0].domain);
      }

      // Establecer cookies
      await cookieManager.setAccountCookies(account);

      // Actualizar storage
      await storage.set('currentAccount', account);
      this.currentAccount = account;

      // Abrir dominio en nueva pestaña
      const domain = account.cookies[0].domain.replace(/^\./, '');
      chrome.tabs.create({ url: `https://${domain}` });

      ui.showSuccess('Account switched successfully');

      // Actualizar lista de cuentas
      const accounts = await accountService.getAccounts();
      ui.updateAccountsList(accounts, account);

    } catch (error) {
      console.error('Error switching account:', error);
      ui.showError(error.message);
      throw error;
    }
  }

  async cleanupCurrentSession() {
    try {
      const currentAccount = await storage.get('currentAccount');
      if (currentAccount) {
        await sessionService.endSession(currentAccount.id);
        await cookieManager.removeAccountCookies(currentAccount);
      }
      await storage.remove('currentAccount');
      this.currentAccount = null;
    } catch (error) {
      console.error('Error cleaning up session:', error);
    }
  }
}

export const accountManager = new AccountManager();