import { accountService } from './services/accountService.js';
import { cookieManager } from './utils/cookie/cookieManager.js';
import { storage } from './utils/storage.js';
import { analyticsService } from './services/analyticsService.js';

class AccountManager {
    constructor() {
        this.currentAccount = null;
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        chrome.tabs.onRemoved.addListener(async (tabId) => {
            await this.handleTabClose(tabId);
        });

        chrome.runtime.onSuspend.addListener(async () => {
            await this.cleanupCurrentSession();
        });
    }

    async switchAccount(newAccount) {
        try {
            console.log('Switching to account:', newAccount);
            const currentAccount = await storage.get('currentAccount');
            
            // Si hay una cuenta actual, limpiar sus cookies primero
            if (currentAccount) {
                console.log('Removing cookies for current account:', currentAccount);
                await cookieManager.removeAccountCookies(currentAccount);
                // Decrementar usuarios activos de la cuenta actual
                await accountService.decrementActiveUsers(currentAccount.id);
            }

            // Incrementar usuarios activos de la nueva cuenta
            const success = await accountService.incrementActiveUsers(newAccount.id);
            if (!success) {
                throw new Error('Maximum concurrent users reached');
            }

            console.log('Setting cookies for new account:', newAccount);
            // Establecer cookies de la nueva cuenta
            await cookieManager.setAccountCookies(newAccount);
            
            // Guardar la nueva cuenta como actual
            await storage.set('currentAccount', newAccount);
            this.currentAccount = newAccount;

            // Registrar el cambio en analytics
            await analyticsService.trackAccountSwitch(currentAccount, newAccount);

            return true;
        } catch (error) {
            console.error('Error switching account:', error);
            // Si algo falla, intentar revertir el incremento de usuarios activos
            await accountService.decrementActiveUsers(newAccount.id);
            throw error;
        }
    }

    async handleTabClose(tabId) {
        try {
            const currentAccount = await storage.get('currentAccount');
            if (!currentAccount) return;

            const tabs = await chrome.tabs.query({});
            const accountDomains = currentAccount.cookies.map(c => c.domain.replace(/^\./, ''));
            
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
                await accountService.decrementActiveUsers(currentAccount.id);
                await cookieManager.removeAccountCookies(currentAccount);
                await storage.remove('currentAccount');
                this.currentAccount = null;
            }
        } catch (error) {
            console.error('Error cleaning up session:', error);
        }
    }
}

export const accountManager = new AccountManager();