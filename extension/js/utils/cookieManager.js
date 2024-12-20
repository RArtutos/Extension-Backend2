class CookieManager {
  async setAccountCookies(account) {
    if (!account?.cookies?.length) {
      console.warn('No cookies found for account');
      return;
    }

    try {
      console.log('Setting cookies for account:', account);
      const domains = [];
      
      // Primero eliminar todas las cookies existentes
      for (const cookie of account.cookies) {
        const domain = cookie.domain;
        domains.push(domain);
        await this.removeAllCookiesForDomain(domain);
      }

      // Luego establecer las nuevas cookies
      for (const cookie of account.cookies) {
        console.log('Processing cookie:', cookie);
        if (cookie.name === 'header_cookies') {
          await this.setHeaderCookies(cookie.domain, cookie.value);
        } else {
          await this.setCookie(cookie.domain, cookie.name, cookie.value);
        }
      }

      // Almacenar los dominios gestionados
      this.managedDomains = new Set(domains);
      await chrome.storage.local.set({ managedDomains: Array.from(this.managedDomains) });
      
      // Verificar que las cookies se establecieron correctamente
      for (const domain of domains) {
        const cookies = await chrome.cookies.getAll({ domain });
        console.log(`Cookies set for ${domain}:`, cookies);
      }

    } catch (error) {
      console.error('Error setting account cookies:', error);
      throw error;
    }
  }

  async setCookie(domain, name, value) {
    const cleanDomain = domain.startsWith('.') ? domain.substring(1) : domain;
    const url = `https://${cleanDomain}`;
    
    console.log(`Setting cookie for ${url}:`, { name, domain, cleanDomain });
    
    const cookieData = {
      url,
      name,
      value,
      domain: domain, // Mantener el punto inicial si existe
      path: '/',
      secure: true,
      sameSite: 'lax'
    };

    try {
      const result = await chrome.cookies.set(cookieData);
      console.log('Cookie set result:', result);
      if (!result) {
        throw new Error('Failed to set cookie');
      }
    } catch (error) {
      console.warn(`Error setting cookie ${name}, retrying with alternative settings:`, error);
      try {
        const fallbackData = {
          ...cookieData,
          secure: false,
          sameSite: 'no_restriction',
          domain: cleanDomain // Usar dominio sin punto
        };
        const result = await chrome.cookies.set(fallbackData);
        console.log('Cookie set result (fallback):', result);
        if (!result) {
          throw new Error('Failed to set cookie with fallback');
        }
      } catch (retryError) {
        console.error(`Failed to set cookie ${name} after retry:`, retryError);
        throw retryError;
      }
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
    const cookies = await chrome.cookies.getAll({ domain: cleanDomain });
    
    for (const cookie of cookies) {
      try {
        await chrome.cookies.remove({
          url: `https://${cleanDomain}`,
          name: cookie.name
        });
      } catch (error) {
        console.warn(`Error removing cookie ${cookie.name}:`, error);
      }
    }
  }

  async setHeaderCookies(domain, cookieString) {
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
