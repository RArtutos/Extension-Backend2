import { API_URL } from '../config/constants.js';
import { storage } from './storage.js';
import { STORAGE_KEYS } from '../config/constants.js';

class HttpClient {
  async getHeaders() {
    const token = await storage.get(STORAGE_KEYS.TOKEN);
    return {
      'Authorization': token ? `Bearer ${token}` : '',
      'Content-Type': 'application/json'
    };
  }

  async get(endpoint) {
    try {
      const headers = await this.getHeaders();
      const response = await fetch(`${API_URL}${endpoint}`, { headers });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Request failed');
      }

      return await response.json();
    } catch (error) {
      console.error('GET request failed:', error);
      throw error;
    }
  }

  async post(endpoint, data = {}) {
    try {
      const headers = await this.getHeaders();
      const response = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Request failed');
      }

      return await response.json();
    } catch (error) {
      console.error('POST request failed:', error);
      throw error;
    }
  }

  async delete(endpoint) {
    try {
      const headers = await this.getHeaders();
      const response = await fetch(`${API_URL}${endpoint}`, {
        method: 'DELETE',
        headers
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Request failed');
      }

      return await response.json();
    } catch (error) {
      console.error('DELETE request failed:', error);
      throw error;
    }
  }
}

export const httpClient = new HttpClient();