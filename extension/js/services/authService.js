import { API_URL } from '../config/constants.js';
import { storage } from '../utils/storage.js';
import { STORAGE_KEYS } from '../config/constants.js';

class AuthService {
  constructor() {
    this.validationInterval = 60000; // 1 minuto por defecto
    this.validationTimer = null;
    this.startValidationCheck();
  }

  async startValidationCheck() {
    // Limpiar timer existente si hay uno
    if (this.validationTimer) {
      clearInterval(this.validationTimer);
    }

    // Iniciar nuevo timer
    this.validationTimer = setInterval(async () => {
      await this.validateUserStatus();
    }, this.validationInterval);
  }

  async validateUserStatus() {
    const token = await this.getToken();
    if (!token) return;

    try {
      const response = await fetch(`${API_URL}/api/auth/validate`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        // Si el usuario no es válido, limpiar todo
        await this.cleanup();
      }
    } catch (error) {
      console.error('Error validating user status:', error);
      await this.cleanup();
    }
  }

  async cleanup() {
    // Enviar mensaje al background script para limpiar cookies
    chrome.runtime.sendMessage({ type: 'CLEANUP_COOKIES' });
    
    // Limpiar storage
    await this.logout();
    
    // Notificar al popup si está abierto
    chrome.runtime.sendMessage({ type: 'SESSION_EXPIRED' });
  }

  async login(email, password) {
    try {
      const formData = new URLSearchParams();
      formData.append('username', email);
      formData.append('password', password);

      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString()
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Invalid credentials');
      }

      const data = await response.json();
      if (!data.access_token) {
        throw new Error('Invalid response from server');
      }

      await storage.set(STORAGE_KEYS.TOKEN, data.access_token);
      await storage.set(STORAGE_KEYS.EMAIL, email);
      
      // Iniciar verificación periódica
      this.startValidationCheck();
      
      return data;
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  }

  async logout() {
    // Enviar mensaje al background script para limpiar cookies
    chrome.runtime.sendMessage({ type: 'CLEANUP_COOKIES' });
    
    // Limpiar storage
    await storage.remove([STORAGE_KEYS.TOKEN, STORAGE_KEYS.CURRENT_ACCOUNT, STORAGE_KEYS.EMAIL]);
    
    // Detener la verificación periódica
    if (this.validationTimer) {
      clearInterval(this.validationTimer);
      this.validationTimer = null;
    }
  }

  async getToken() {
    return await storage.get(STORAGE_KEYS.TOKEN);
  }

  async getEmail() {
    return await storage.get(STORAGE_KEYS.EMAIL);
  }

  async isAuthenticated() {
    const token = await this.getToken();
    return !!token;
  }

  setValidationInterval(interval) {
    this.validationInterval = interval;
    this.startValidationCheck();
  }
}

export const authService = new AuthService();