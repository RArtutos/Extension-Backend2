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

    chrome.storage.onChanged.addListener((changes, namespace) => {
      console.log('Cambios en el almacenamiento:', changes);
      if (changes.currentAccount) {
        this.handleAccountChange(changes.currentAccount.newValue, changes.currentAccount.oldValue);
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
      console.log('Pestañas abiertas:', tabs);
      
      for (const domain of this.managedDomains) {
        const cleanDomain = domain.replace(/^\./, '');
        
        const hasOpenTabs = tabs.some(tab => {
          try {
            if (!tab.url) return false;
            const tabDomain = new URL(tab.url).hostname;
            return tabDomain === cleanDomain || tabDomain.endsWith('.' + cleanDomain);
          } catch {
            return false;
          }
        });

        if (!hasOpenTabs) {
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

      // Obtener el email del almacenamiento local de Chrome
      chrome.storage.local.get(['email'], async (result) => {
        const email = result.email;
        if (email) {
          console.log('Email encontrado:', email);
          const token = await this.getToken();
          if(!token) return;
          
          try {
            const response = await fetch(`${this.API_URL}/delete/sessions?email=${email}&domain=${cleanDomain}`, {
              method: 'DELETE',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              }
            });

            if (!response.ok) {
              console.error('Error en la solicitud DELETE:', response.status);
            }
          } catch (error) {
            console.error('Error al enviar la solicitud DELETE:', error);
          }
        }
      });
    } catch (error) {
      console.error(`Error removing cookies for domain ${domain}:`, error);
    }
  },

  async setAccountCookies(account) {
    if (!account?.cookies?.length) return;

    try {
      const domains = [];
      
      for (const cookie of account.cookies) {
        const domain = cookie.domain;
        domains.push(domain);

        if (cookie.name === 'header_cookies') {
          await this.setHeaderCookies(domain, cookie.value);
        } else {
          await this.setCookie(domain, cookie.name, cookie.value);
        }
      }

      this.managedDomains = new Set(domains);
      await chrome.storage.local.set({ managedDomains: Array.from(this.managedDomains) });
      console.log('Cookies de cuenta establecidas:', account);
    } catch (error) {
      console.error('Error setting account cookies:', error);
    }
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
      console.log(`Cookie establecida: ${name} en ${domain}`);
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
        console.log(`Cookie establecida con configuración alternativa: ${name} en ${domain}`);
      } catch (retryError) {
        console.error(`Failed to set cookie ${name} after retry:`, retryError);
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
  },

  async getToken() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['token'], (result) => {
        resolve(result.token);
      });
    });
  }
};

// Manejador de mensajes
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'SET_MANAGED_DOMAINS') {
    cookieManager.managedDomains = new Set(request.domains);
    chrome.storage.local.set({
      managedDomains: Array.from(cookieManager.managedDomains),
    });
    sendResponse({ success: true });
    console.log('Dominios gestionados establecidos:', request.domains);
    return true;
  }
});

// Inicializar el gestor de cookies
cookieManager.init();