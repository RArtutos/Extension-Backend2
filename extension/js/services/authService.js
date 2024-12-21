import { API_URL } from '../config/constants.js';
import { storage } from '../utils/storage.js';
import { STORAGE_KEYS } from '../config/constants.js';

class AuthService {
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
      return data;
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  }

  async logout() {
    await storage.remove([STORAGE_KEYS.TOKEN, STORAGE_KEYS.CURRENT_ACCOUNT]);
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