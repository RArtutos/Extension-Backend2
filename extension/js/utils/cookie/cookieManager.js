import { storage } from '../storage.js';
import { analyticsService } from '../../services/analyticsService.js';

class CookieManager {
  constructor() {
    this.managedDomains = new Set();
  }

  async setAccountCookies(account) {
    if (!account?.cookies?.length) {
      console.warn('No cookies found for account');
      return;
    }

    try {
      console.log('Setting cookies for account:', account);
      const domains = [];
      
      for (const cookie of account.cookies) {
        const domain = cookie.domain;
        domains.push(domain);
        
        console.log(`Processing cookies for domain: ${domain}`);
        await this.removeAllCookiesForDomain(domain);

        if (cookie.name === 'header_cookies') {
          await this.setHeaderCookies(domain, cookie.value);
        } else {
          await this.setCookie(domain, cookie.name, cookie.value);
        }
      }

      this.managedDomains = new Set(domains);
      await chrome.storage.local.set({ managedDomains: Array.from(this.managedDomains) });
      console.log('Successfully set all cookies');

    } catch (error) {
      console.error('Error setting account cookies:', error);
      throw new Error('Failed to set account cookies');
    }
  }

  async removeAccountCookies(account) {
    if (!account?.cookies?.length) return;
    
    console.log('Removing cookies for account:', account);
    for (const cookie of account.cookies) {
      await this.removeAllCookiesForDomain(cookie.domain);
    }
  }

  async removeAllCookiesForDomain(domain) {
    const cleanDomain = domain.startsWith('.') ? domain.substring(1) : domain;
    console.log(`Removing all cookies for domain: ${cleanDomain}`);
    
    try {
      const cookies = await chrome.cookies.getAll({ domain: cleanDomain });
      console.log(`Found ${cookies.length} cookies to remove`);
      
      for (const cookie of cookies) {
        const protocol = cookie.secure ? 'https://' : 'http://';
        const cookieUrl = `${protocol}${cookie.domain}${cookie.path}`;
        
        try {
          await chrome.cookies.remove({
            url: cookieUrl,
            name: cookie.name,
            storeId: cookie.storeId
          });
          console.log(`Successfully removed cookie: ${cookie.name}`);
        } catch (error) {
          console.error(`Error removing cookie ${cookie.name}:`, error);
        }
      }

      // Cleanup analytics after removing cookies
      await analyticsService.cleanupDomainAnalytics(cleanDomain);
    } catch (error) {
      console.error(`Error removing cookies for domain ${domain}:`, error);
    }
  }

  async setCookie(domain, name, value) {
    const cleanDomain = domain.startsWith('.') ? domain.substring(1) : domain;
    const url = `https://${cleanDomain}`;
    
    console.log(`Setting cookie: ${name} for domain: ${domain}`);
    
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
      console.log(`Successfully set cookie: ${name}`);
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
        console.log(`Successfully set cookie: ${name} with alternative settings`);
      } catch (retryError) {
        console.error(`Failed to set cookie ${name} after retry:`, retryError);
        throw retryError;
      }
    }
  }

  async setHeaderCookies(domain, cookieString) {
    if (!cookieString) return;
    
    console.log(`Setting header cookies for domain: ${domain}`);
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