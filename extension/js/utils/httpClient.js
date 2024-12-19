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
        if (response.status === 401) {
          await storage.remove([STORAGE_KEYS.TOKEN, STORAGE_KEYS.CURRENT_ACCOUNT]);
          chrome.runtime.sendMessage({ type: 'SESSION_EXPIRED' });
        }
        throw new Error(await this.handleErrorResponse(response));
      }

      return await response.json();
    } catch (error) {
      console.error('GET request failed:', error);
      throw error;
    }
  }

  async post(endpoint, data) {
    try {
      const headers = await this.getHeaders();
      const response = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        throw new Error(await this.handleErrorResponse(response));
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
        throw new Error(await this.handleErrorResponse(response));
      }

      return true;
    } catch (error) {
      console.error('DELETE request failed:', error);
      throw error;
    }
  }

  async handleErrorResponse(response) {
    try {
      const errorData = await response.json();
      return errorData.detail || errorData.message || 'Request failed';
    } catch {
      return 'Request failed';
    }
  }
}

export const httpClient = new HttpClient();