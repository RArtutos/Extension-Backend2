import { storage } from '../storage.js';
import { sessionService } from '../../services/sessionService.js';

class CookieManager {
  constructor() {
    this.managedDomains = new Set();
    this.setupCookieListener();  // Agregado el listener para la eliminación de cookies
  }

  setupCookieListener() {
    chrome.cookies.onRemoved.addListener(async (changeInfo) => {
      await this.handleCookieRemoval(changeInfo);
    });
  }

  async handleCookieRemoval(changeInfo) {
    const currentAccount = await storage.get('currentAccount');
    if (!currentAccount) return;

    const removedCookie = changeInfo.cookie;
    const isManaged = currentAccount.cookies.some(cookie => 
      cookie.domain === removedCookie.domain || 
      cookie.domain === `.${removedCookie.domain}`
    );

    if (isManaged) {
      // Verificar si todas las cookies importantes fueron eliminadas
      const remainingCookies = await this.checkRemainingCookies(currentAccount);
      if (!remainingCookies) {
        await sessionService.endSession(currentAccount.id, this.getDomain(currentAccount));
        await storage.remove('currentAccount');
      }
    }
  }

  async checkRemainingCookies(account) {
    for (const cookie of account.cookies) {
      const domain = cookie.domain.startsWith('.') ? cookie.domain.substring(1) : cookie.domain;
      const cookies = await chrome.cookies.getAll({ domain });
      if (cookies.length > 0) {
        return true;
      }
    }
    return false;
  }

  getDomain(account) {
    if (!account?.cookies?.length) return '';
    const domain = account.cookies[0].domain;
    return domain.startsWith('.') ? domain.substring(1) : domain;
  }

  async setAccountCookies(account) {
    if (!account?.cookies?.length) {
      console.warn('No cookies found for account');
      return;
    }

    try {
      const domains = [];
      
      for (const cookie of account.cookies) {
        const domain = cookie.domain;
        domains.push(domain);
        
        // Eliminar cookies existentes antes de establecer nuevas
        await this.removeAllCookiesForDomain(domain);

        if (cookie.name === 'header_cookies') {
          await this.setHeaderCookies(domain, cookie.value);
        } else {
          await this.setCookie(domain, cookie.name, cookie.value);
        }
      }

      this.managedDomains = new Set(domains);
      chrome.runtime.sendMessage({
        type: 'SET_MANAGED_DOMAINS',
        domains: Array.from(this.managedDomains)
      });

    } catch (error) {
      console.error('Error setting account cookies:', error);
      throw new Error('Failed to set account cookies');
    }
  }

  async removeAccountCookies(account) {
    if (!account?.cookies?.length) return;
    
    for (const cookie of account.cookies) {
      await this.removeAllCookiesForDomain(cookie.domain);
    }
  }

  async removeAllCookiesForDomain(domain) {
    const cleanDomain = domain.startsWith('.') ? domain.substring(1) : domain;
    try {
      const cookies = await chrome.cookies.getAll({ domain: cleanDomain });
      
      for (const cookie of cookies) {
        try {
          await chrome.cookies.remove({
            url: `https://${cleanDomain}${cookie.path}`,
            name: cookie.name,
            storeId: cookie.storeId
          });
        } catch (error) {
          console.warn(`Error removing cookie ${cookie.name}:`, error);
        }
      }
    } catch (error) {
      console.error(`Error removing cookies for domain ${domain}:`, error);
    }
  }

  async setCookie(domain, name, value) {
    const cleanDomain = domain.startsWith('.') ? domain.substring(1) : domain;
    const url = `https://${cleanDomain}`;
    
    try {
      await chrome.cookies.set({
        url,
        name,
        value,
        domain,
        path: '/',
        secure: true,
        sameSite: 'lax'
      });
    } catch (error) {
      console.warn(`Error setting cookie ${name}, retrying with alternative settings:`, error);
      try {
        await chrome.cookies.set({
          url,
          name,
          value,
          domain: cleanDomain,
          path: '/',
          secure: false,
          sameSite: 'no_restriction'
        });
      } catch (retryError) {
        console.error(`Failed to set cookie ${name} after retry:`, retryError);
        throw retryError;
      }
    }
  }

  async setHeaderCookies(domain, cookieString) {
    if (!cookieString) return;
    
    const cookies = this.parseHeaderString(cookieString);
    for (const cookie of cookies) {
      await this.setCookie(domain, cookie.name, cookie.value);
    }
  }

  parseHeaderString(cookieString) {
    if (!cookieString) return [];
    
    const cookies = [];
    const pairs = cookieString.split(';');
    
    for (const pair of pairs) {
      const [name, value] = pair.trim().split('=');
      if (name && value) {
        cookies.push({ name: name.trim(), value: value.trim() });
      }
    }
    
    return cookies;
  }
}

export const cookieManager = new CookieManager();
