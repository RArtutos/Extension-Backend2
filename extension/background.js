const cookieManager = {
  managedDomains: new Set(),
  sessionCheckInterval: null,
  API_URL: 'https://api.artutos.us.kg',

  init() {
    console.log('Inicializando cookieManager');
    this.loadManagedDomains();
    this.setupEventListeners();
    this.startSessionCheck();
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
    // Escuchar cierre de pestañas
    chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
      console.log('Pestaña cerrada:', tabId);
      await this.handleTabClose(tabId);
    });

    // Limpiar al cerrar el navegador
    chrome.runtime.onSuspend.addListener(() => {
      console.log('Navegador cerrado');
      this.cleanupAllCookies();
    });

    // Escuchar cambios en el almacenamiento
    chrome.storage.onChanged.addListener((changes, namespace) => {
      console.log('Cambios en el almacenamiento:', changes);
      if (changes.currentAccount) {
        this.handleAccountChange(changes.currentAccount.newValue, changes.currentAccount.oldValue);
      }
    });
  },

  async handleAccountChange(newAccount, oldAccount) {
    console.log('Cambio de cuenta:', { newAccount, oldAccount });
    if (oldAccount) {
      await this.removeCookiesForAccount(oldAccount);
    }
    if (newAccount) {
      await this.setAccountCookies(newAccount);
    }
  },

  startSessionCheck() {
    console.log('Iniciando verificación de sesión');
    // Verificar el estado de la sesión cada 30 segundos
    this.sessionCheckInterval = setInterval(async () => {
      console.log('Verificando estado de la sesión');
      await this.checkSessionStatus();
    }, 30000);
  },

  async checkSessionStatus() {
    try {
      const currentAccount = await this.getCurrentAccount();
      if (!currentAccount) return;

      const token = await this.getToken();
      if (!token) return;

      const response = await fetch(`${this.API_URL}/api/accounts/${currentAccount.id}/session`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        // Si hay un error 401 o la sesión no es válida, limpiar cookies
        console.log('Error en la verificación de la sesión:', response.status);
        if (response.status === 401 || response.status === 403) {
          await this.cleanupCurrentSession();
        }
        return;
      }

      const sessionData = await response.json();
      console.log('Datos de la sesión:', sessionData);
      if (!sessionData.active || sessionData.status === 'cancelled') {
        await this.cleanupCurrentSession();
      }
    } catch (error) {
      console.error('Error checking session status:', error);
    }
  },

  async getCurrentAccount() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['currentAccount'], (result) => {
        resolve(result.currentAccount);
      });
    });
  },

  async getToken() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['token'], (result) => {
        resolve(result.token);
      });
    });
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

  async removeCookiesForAccount(account) {
    if (!account?.cookies?.length) return;
    
    for (const cookie of account.cookies) {
      await this.removeCookiesForDomain(cookie.domain);
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
          // Aquí se envía la solicitud DELETE a la API para decrementar usuarios activos
          const token = await this.getToken();
          if(!token) {
            console.error('Token no encontrado');
            return;
          }
          console.log('Token obtenido:', token);
          try {
            const response = await fetch(`${this.API_URL}/delete/sessions?email=${email}&domain=${cleanDomain}`, {
              method: 'DELETE',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              }
            });

            if (response.ok) {
              const accountIds = await response.json();
              console.log('IDs de cuenta eliminados:', accountIds);
              for (const accountId of accountIds) {
                await fetch(`${this.API_URL}/api/accounts/${accountId}/active`, {
                  method: 'DELETE',
                  headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                  }
                });
              }
            } else {
              console.error('Error en la solicitud DELETE:', response.status);
            }
          } catch (error) {
            console.error('Error al enviar la solicitud DELETE:', error);
          }
        } else {
          console.error('Email no encontrado en el almacenamiento local');
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
        
        await this.removeCookiesForDomain(domain);

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

  async cleanupCurrentSession() {
    try {
      const currentAccount = await this.getCurrentAccount();
      if (currentAccount) {
        await this.removeCookiesForAccount(currentAccount);
      }
      
      await chrome.storage.local.remove(['currentAccount', 'managedDomains']);
      this.managedDomains.clear();
      console.log('Sesión actual limpiada');

      // Notificar al popup que la sesión ha expirado
      chrome.runtime.sendMessage({ type: 'SESSION_EXPIRED' });
    } catch (error) {
      console.error('Error during session cleanup:', error);
    }
  },

  async cleanupAllCookies() {
    try {
      const domains = Array.from(this.managedDomains);
      for (const domain of domains) {
        await this.removeCookiesForDomain(domain);
      }
      await chrome.storage.local.remove(['managedDomains', 'currentAccount']);
      this.managedDomains.clear();
      console.log('Todas las cookies limpiadas');
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
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
  } else if (request.type === 'REMOVE_COOKIES') {
    const { domain, email } = request;
    cookieManager.removeCookiesForDomain(domain, email).then(() => {
      sendResponse({ success: true });
      console.log('Cookies eliminadas para el dominio:', domain);
    }).catch(error => {
      console.error('Error removing cookies:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }
});

// Inicializar el gestor de cookies
cookieManager.init();
