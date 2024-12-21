import { storage } from '../storage.js';
import { sessionService } from '../../services/sessionService.js';
import { httpClient } from '../httpClient.js';

class CookieManager {
  constructor() {
    this.managedDomains = new Set();
    this.maxRetries = 3;
    this.retryDelay = 50; // 500ms entre reintentos
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
        
        if (cookie.name === 'header_cookies') {
          await this.setHeaderCookiesWithVerification(domain, cookie.value);
        } else {
          await this.setCookieWithVerification(domain, cookie.name, cookie.value);
        }
      }

      this.managedDomains = new Set(domains);
      chrome.runtime.sendMessage({
        type: 'SET_MANAGED_DOMAINS',
        domains: Array.from(this.managedDomains)
      });

      // Verificación final de todas las cookies
      const allCookiesSet = await this.verifyAllCookies(account);
      if (!allCookiesSet) {
        console.warn('Some cookies failed to set after all retries');
      }

      return allCookiesSet;

    } catch (error) {
      console.error('Error setting account cookies:', error);
      throw new Error('Failed to set account cookies');
    }
  }

  async verifyAllCookies(account) {
    for (const cookie of account.cookies) {
      const domain = cookie.domain;
      const cleanDomain = domain.startsWith('.') ? domain.substring(1) : domain;
      
      if (cookie.name === 'header_cookies') {
        const headerCookies = this.parseHeaderString(cookie.value);
        for (const headerCookie of headerCookies) {
          const isSet = await this.verifyCookie(cleanDomain, headerCookie.name);
          if (!isSet) return false;
        }
      } else {
        const isSet = await this.verifyCookie(cleanDomain, cookie.name);
        if (!isSet) return false;
      }
    }
    return true;
  }

  async verifyCookie(domain, name) {
    const cookies = await chrome.cookies.getAll({ domain, name });
    return cookies.length > 0;
  }

  async setCookieWithVerification(domain, name, value) {
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      await this.setCookie(domain, name, value);
      
      // Verificar si la cookie se estableció correctamente
      const isSet = await this.verifyCookie(domain.startsWith('.') ? domain.substring(1) : domain, name);
      if (isSet) return true;
      
      // Esperar antes de reintentar
      await new Promise(resolve => setTimeout(resolve, this.retryDelay));
    }
    return false;
  }

  async setHeaderCookiesWithVerification(domain, cookieString) {
    if (!cookieString) return true;
    
    const cookies = this.parseHeaderString(cookieString);
    for (const cookie of cookies) {
      const success = await this.setCookieWithVerification(domain, cookie.name, cookie.value);
      if (!success) return false;
    }
    return true;
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
      }
    }
  }

  async removeAccountCookies(account) {
    if (!account?.cookies?.length) return;
    
    try {
      await sessionService.endSession(account.id, this.getDomain(account));
    } catch (error) {
      console.error('Error removing account cookies:', error);
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

  getDomain(account) {
    if (!account?.cookies?.length) return '';
    const domain = account.cookies[0].domain;
    return domain.startsWith('.') ? domain.substring(1) : domain;
  }
}

export const cookieManager = new CookieManager();