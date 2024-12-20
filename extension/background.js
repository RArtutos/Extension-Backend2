const cookieManager = {
  managedDomains: new Set(),
  API_URL: 'https://api.artutos.us.kg',

  init() {
    console.log('Inicializando cookieManager');
    this.loadManagedDomains();
    this.setupEventListeners();
  },

  loadManagedDomains() {
    console.log('Cargando dominios gestionados');
    chrome.storage.local.get(['managedDomains'], (result) => {
      if (result.managedDomains) {
        this.managedDomains = new Set(result.managedDomains);
      }
      console.log('Dominios gestionados cargados:', this.managedDomains);
    });
  },

  setupEventListeners() {
    console.log('Configurando eventListeners');
    chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
      console.log('Pestaña cerrada:', tabId);
      await this.handleTabClose(tabId);
    });

    chrome.runtime.onSuspend.addListener(() => {
      console.log('Navegador cerrado');
      this.cleanupAllCookies();
    });

    chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
      if (request.type === 'CLEANUP_COOKIES') {
        await this.cleanupAllCookies();
        sendResponse({ success: true });
      }
      if (request.type === 'SET_MANAGED_DOMAINS') {
        const newDomains = request.domains || [];
        newDomains.forEach(domain => this.managedDomains.add(domain));
        await chrome.storage.local.set({
          managedDomains: Array.from(this.managedDomains),
        });
        sendResponse({ success: true });
      }
      return true;
    });

    chrome.storage.onChanged.addListener((changes, namespace) => {
      console.log('Storage changed:', changes);
      if (changes.currentAccount) {
        this.handleAccountChange(changes.currentAccount.newValue, changes.currentAccount.oldValue);
      }
      if (changes.managedDomains) {
        const existingDomains = Array.from(this.managedDomains);
        const newDomains = changes.managedDomains.newValue || [];
        this.managedDomains = new Set([...existingDomains, ...newDomains]);
      }
    });
  },

  async handleAccountChange(newAccount, oldAccount) {
    console.log('Cambio de cuenta:', { newAccount, oldAccount });
    if (newAccount) {
      await this.setAccountCookies(newAccount);
    }
  },

  async handleTabClose(tabId) {
    try {
      const tabs = await chrome.tabs.query({});
      console.log('Pestañas abiertas:', tabs, 'Dominios gestionados:', this.managedDomains);
      
      for (const domain of this.managedDomains) {
        const cleanDomain = domain.replace(/^\./, '');
        
        const hasOpenTabsForDomain = tabs.some(tab => {
          try {
            if (!tab.url) return false;
            const tabDomain = new URL(tab.url).hostname;
            return tabDomain === cleanDomain || tabDomain.endsWith('.' + cleanDomain);
          } catch {
            return false;
          }
        });

        if (!hasOpenTabsForDomain) {
          console.log('No hay pestañas abiertas para el dominio:', domain);
          await this.removeCookiesForDomain(domain);
        }
      }
    } catch (error) {
      console.error('Error handling tab close:', error);
    }
  },

  async removeCookiesForDomain(domain) {
    const cleanDomain = domain.startsWith('.') ? domain.substring(1) : domain;

    try {
      const cookies = await chrome.cookies.getAll({ domain: cleanDomain });
      console.log('Eliminando cookies para el dominio:', domain, cookies);
      
      for (const cookie of cookies) {
        const protocol = cookie.secure ? 'https://' : 'http://';
        const cookieUrl = `${protocol}${cookie.domain}${cookie.path}`;
        
        try {
          await chrome.cookies.remove({
            url: cookieUrl,
            name: cookie.name,
            storeId: cookie.storeId
          });
        } catch (error) {
          console.error(`Error removing cookie ${cookie.name}:`, error);
        }
      }

      const token = await this.getToken();
      const email = await this.getEmail();
      
      if (email && token) {
        try {
          const response = await fetch(
            `${this.API_URL}/delete/sessions?email=${encodeURIComponent(email)}&domain=${encodeURIComponent(cleanDomain)}`,
            {
              method: 'DELETE',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              }
            }
          );

          if (!response.ok) {
            console.error('Error en la solicitud DELETE:', response.status);
          }
        } catch (error) {
          console.error('Error al enviar la solicitud DELETE:', error);
        }
      }
    } catch (error) {
      console.error(`Error removing cookies for domain ${domain}:`, error);
    }
  },

  async cleanupAllCookies() {
    console.log('Limpiando todas las cookies...');
    for (const domain of this.managedDomains) {
      await this.removeCookiesForDomain(domain);
    }
    console.log('Limpieza de cookies completada');
  },

  async setAccountCookies(account) {
    if (!account?.cookies?.length) return;

    try {
      const domains = [];
      let retryCount = 0;
      const maxRetries = 3;
      
      for (const cookie of account.cookies) {
        const domain = cookie.domain;
        domains.push(domain);

        let cookiesSet = false;
        while (!cookiesSet && retryCount < maxRetries) {
          try {
            if (cookie.name === 'header_cookies') {
              await this.setHeaderCookies(domain, cookie.value);
            } else {
              await this.setCookie(domain, cookie.name, cookie.value);
            }
            cookiesSet = await this.verifyCookie(domain, cookie.name);
          } catch (error) {
            console.error(`Error setting cookie, attempt ${retryCount + 1}:`, error);
          }
          
          if (!cookiesSet) {
            retryCount++;
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
      }

      domains.forEach(domain => this.managedDomains.add(domain));
      await chrome.storage.local.set({ 
        managedDomains: Array.from(this.managedDomains) 
      });
      
      console.log('Cookies de cuenta establecidas:', account);
      console.log('Dominios gestionados actualizados:', this.managedDomains);
    } catch (error) {
      console.error('Error setting account cookies:', error);
    }
  },

  async getToken() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['token'], (result) => {
        resolve(result.token);
      });
    });
  },

  async getEmail() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['email'], (result) => {
        resolve(result.email);
      });
    });
  },

  async verifyCookie(domain, name) {
    const cleanDomain = domain.startsWith('.') ? domain.substring(1) : domain;
    const cookies = await chrome.cookies.getAll({ domain: cleanDomain, name });
    return cookies.length > 0;
  },

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
  },

  async setHeaderCookies(domain, cookieString) {
    if (!cookieString) return;
    
    const cookies = this.parseHeaderString(cookieString);
    for (const cookie of cookies) {
      await this.setCookie(domain, cookie.name, cookie.value);
    }
  },

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
};

// Inicializar el gestor de cookies
cookieManager.init();