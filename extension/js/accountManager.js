import { accountService } from './services/accountService.js';
import { sessionService } from './services/sessionService.js';
import { cookieManager } from './utils/cookie/cookieManager.js';
import { analyticsService } from './services/analyticsService.js';
import { ui } from './utils/ui.js';
import { storage } from './utils/storage.js';

class AccountManager {
  constructor() {
    this.currentAccount = null;
  }

  async switchAccount(account) {
    try {
      const currentAccount = await storage.get('currentAccount');
      
      // Si hay una cuenta actual, finalizar su sesión
      if (currentAccount) {
        await sessionService.endSession(currentAccount.id, this.getDomain(currentAccount));
      }

      // Iniciar nueva sesión
      await sessionService.startSession(account.id, this.getDomain(account));

      // Establecer cookies
      await cookieManager.setAccountCookies(account);

      // Actualizar storage
      await storage.set('currentAccount', account);
      this.currentAccount = account;

      // Abrir dominio en nueva pestaña y rastrearla
      chrome.tabs.create({ url: `https://${this.getDomain(account)}` }, async (tab) => {
        // Notificar al background script para trackear la pestaña
        chrome.runtime.sendMessage({
          type: 'TRACK_TAB',
          tabId: tab.id,
          account: account
        });
      });

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

  // ... resto del código ...
}

export const accountManager = new AccountManager();