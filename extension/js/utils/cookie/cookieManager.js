import { storage } from '../storage.js';
import { sessionService } from '../../services/sessionService.js';
import { httpClient } from '../httpClient.js';
import { cookieParser } from './cookieParser.js';

class CookieManager {
  constructor() {
    this.managedDomains = new Set();
    this.maxRetries = 3;
    this.retryDelay = 100;
  }

  async setAccountCookies(account) {
    if (!account?.cookies?.length) {
      console.warn('No cookies found for account');
      return false;
    }

    try {
      const domains = [];
      
      for (const cookie of account.cookies) {
        const domain = cookie.domain;
        domains.push(domain);
        
        // Check if this is a login credentials cookie
        if (cookie.value.startsWith('###LoginPass')) {
          await this.handleLoginCredentials(domain, cookie.value);
          continue;
        }
        
        if (cookie.name === 'header_cookies') {
          const parsedCookies = cookieParser.parseHeaderString(cookie.value);
          for (const parsedCookie of parsedCookies) {
            await this.setCookieWithRetry(domain, parsedCookie.name, parsedCookie.value);
          }
        } else {
          await this.setCookieWithRetry(domain, cookie.name, cookie.value);
        }
      }

      this.managedDomains = new Set(domains);
      chrome.runtime.sendMessage({
        type: 'SET_MANAGED_DOMAINS',
        domains: Array.from(this.managedDomains)
      });

      return true;
    } catch (error) {
      console.error('Error setting account cookies:', error);
      return false;
    }
  }

  async handleLoginCredentials(domain, value) {
    try {
      // Parse login credentials
      const lines = value.split('\n');
      const credentials = {};
      
      lines.forEach(line => {
        if (line.startsWith('user:')) {
          credentials.username = line.substring(5).trim();
        } else if (line.startsWith('pass:')) {
          credentials.password = line.substring(5).trim();
        }
      });

      if (!credentials.username || !credentials.password) {
        throw new Error('Invalid login credentials format');
      }

      // Create a new tab and inject the login script
      const cleanDomain = domain.startsWith('.') ? domain.substring(1) : domain;
      const url = `https://${cleanDomain}`;
      
      const tab = await chrome.tabs.create({ url, active: true });

      // Wait for the page to load
      await new Promise(resolve => {
        chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
          if (tabId === tab.id && info.status === 'complete') {
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
          }
        });
      });

      // Inject the login script
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (creds) => {
          // Common selectors for username/email fields
          const userSelectors = [
            'input[type="email"]',
            'input[name="email"]',
            'input[name="username"]',
            'input[id*="email"]',
            'input[id*="user"]',
            'input[class*="email"]',
            'input[class*="user"]'
          ];

          // Common selectors for password fields
          const passSelectors = [
            'input[type="password"]',
            'input[name="password"]',
            'input[id*="password"]',
            'input[class*="password"]'
          ];

          // Common selectors for submit buttons
          const submitSelectors = [
            'button[type="submit"]',
            'input[type="submit"]',
            'button[class*="login"]',
            'button[class*="submit"]',
            'button[id*="login"]',
            'button[id*="submit"]'
          ];

          // Find and fill username field
          const userField = userSelectors.map(selector => document.querySelector(selector))
            .find(el => el !== null);
          if (userField) {
            userField.value = creds.username;
            userField.dispatchEvent(new Event('input', { bubbles: true }));
            userField.dispatchEvent(new Event('change', { bubbles: true }));
          }

          // Find and fill password field
          const passField = passSelectors.map(selector => document.querySelector(selector))
            .find(el => el !== null);
          if (passField) {
            passField.value = creds.password;
            passField.dispatchEvent(new Event('input', { bubbles: true }));
            passField.dispatchEvent(new Event('change', { bubbles: true }));
          }

          // Find and click submit button
          setTimeout(() => {
            const submitButton = submitSelectors.map(selector => document.querySelector(selector))
              .find(el => el !== null);
            if (submitButton) {
              submitButton.click();
            }
          }, 500);
        },
        args: [credentials]
      });

      return true;
    } catch (error) {
      console.error('Error handling login credentials:', error);
      return false;
    }
  }

  async setCookieWithRetry(domain, name, value) {
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        await this.setCookie(domain, name, value);
        return true;
      } catch (error) {
        if (attempt === this.maxRetries - 1) {
          console.error(`Failed to set cookie ${name} after ${this.maxRetries} attempts`);
          throw error;
        }
        await new Promise(resolve => setTimeout(resolve, this.retryDelay));
      }
    }
    return false;
  }

  async setCookie(domain, name, value) {
    const cleanDomain = domain.startsWith('.') ? domain.substring(1) : domain;
    const url = `https://${cleanDomain}`;
    
    const cookieConfig = {
      url,
      name,
      value,
      path: '/',
      secure: true,
      sameSite: 'lax'
    };

    // No incluir domain para cookies __Host-
    if (!name.startsWith('__Host-')) {
      cookieConfig.domain = domain;
    }

    try {
      await chrome.cookies.set(cookieConfig);
    } catch (error) {
      if (!name.startsWith('__Host-')) {
        // Intentar configuración alternativa solo para cookies que no son __Host-
        await chrome.cookies.set({
          ...cookieConfig,
          domain: cleanDomain,
          secure: false,
          sameSite: 'no_restriction'
        });
      } else {
        throw error;
      }
    }
  }

  async removeAccountCookies(account) {
    if (!account?.cookies?.length) return;
    
    try {
      const domain = this.getDomain(account);
      await sessionService.endSession(account.id, domain);
      await this.removeAllCookiesForDomain(domain);
    } catch (error) {
      console.error('Error removing account cookies:', error);
    }
  }

  async removeAllCookiesForDomain(domain) {
    const cleanDomain = domain.startsWith('.') ? domain.substring(1) : domain;
    const cookies = await chrome.cookies.getAll({ domain: cleanDomain });
    
    for (const cookie of cookies) {
      try {
        const protocol = cookie.secure ? 'https://' : 'http://';
        await chrome.cookies.remove({
          url: `${protocol}${cleanDomain}${cookie.path}`,
          name: cookie.name
        });
      } catch (error) {
        console.warn(`Error removing cookie ${cookie.name}:`, error);
      }
    }
  }

  getDomain(account) {
    if (!account?.cookies?.length) return '';
    const domain = account.cookies[0].domain;
    return domain.startsWith('.') ? domain.substring(1) : domain;
  }
}

export const cookieManager = new CookieManager();