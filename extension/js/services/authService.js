import { API_URL } from '../config/constants.js';
import { storage } from '../utils/storage.js';
import { STORAGE_KEYS } from '../config/constants.js';
import { sessionService } from './sessionService.js';

class AuthService {
  async login(email, password) {
    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `username=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || 'Invalid credentials');
      }

      const data = await response.json();
      if (!data.access_token) {
        throw new Error('Invalid response from server');
      }

      await storage.set(STORAGE_KEYS.TOKEN, data.access_token);
      return data;
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  }

  async logout() {
    try {
      const currentAccount = await storage.get(STORAGE_KEYS.CURRENT_ACCOUNT);
      if (currentAccount) {
        await sessionService.endSession(currentAccount.id);
      }
      
      await fetch(`${API_URL}/api/auth/logout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${await storage.get(STORAGE_KEYS.TOKEN)}`
        }
      });
      
      await storage.remove([STORAGE_KEYS.TOKEN, STORAGE_KEYS.CURRENT_ACCOUNT]);
    } catch (error) {
      console.error('Logout error:', error);
      throw error;
    }
  }

  async getToken() {
    return await storage.get(STORAGE_KEYS.TOKEN);
  }

  async isAuthenticated() {
    const token = await this.getToken();
    return !!token;
  }
}

export const authService = new AuthService();