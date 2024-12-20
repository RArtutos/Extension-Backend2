import { accountService } from './services/accountService.js';
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

    async switchAccount(newAccount) {
        try {
            const currentAccount = await storage.get('currentAccount');
            
            // Si hay una cuenta actual, verificar si es del mismo dominio
            if (currentAccount) {
                const currentDomain = this.getAccountDomain(currentAccount);
                const newDomain = this.getAccountDomain(newAccount);
                
                if (currentDomain === newDomain) {
                    // Decrementar usuarios activos de la cuenta actual
                    await accountService.decrementActiveUsers(currentAccount.id);
                }
                
                // Limpiar cookies del dominio actual
                await cookieManager.removeAllCookiesForDomain(currentDomain);
            }

            // Incrementar usuarios activos de la nueva cuenta
            const success = await accountService.incrementActiveUsers(newAccount.id);
            if (!success) {
                throw new Error('Maximum concurrent users reached');
            }

            // Establecer cookies de la nueva cuenta
            await cookieManager.setAccountCookies(newAccount);
            
            // Guardar la nueva cuenta como actual
            await storage.set('currentAccount', newAccount);
            this.currentAccount = newAccount;

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

    getAccountDomain(account) {
        if (!account?.cookies?.length) return null;
        const domain = account.cookies[0].domain;
        return domain.startsWith('.') ? domain.substring(1) : domain;
    }
}

export const accountManager = new AccountManager();
