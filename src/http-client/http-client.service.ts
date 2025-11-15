import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

@Injectable()
export class HttpClientService {
  private readonly logger = new Logger(HttpClientService.name);
  private readonly client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: 'http://localhost:8080', // 🔥 URL твого Java-сервісу
      timeout: 3000,                    // 3s timeout
    });
  }

  // 🔁 універсальна функція з retry
  private async withRetry<T>(
    fn: () => Promise<T>,
    retries = 3,
    delayMs = 500,
  ): Promise<T> {
    let lastError: any;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        this.logger.log(`HTTP attempt ${attempt}/${retries}`);
        return await fn();
      } catch (error) {
        lastError = error;
        this.logger.warn(
          `HTTP request failed on attempt ${attempt}: ${error?.message ?? error}`,
        );

        if (attempt < retries) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }

    this.logger.error('All retry attempts failed', lastError);
    throw lastError;
  }

  // приклад GET-запиту до Java
  async getJavaHealth() {
    return this.withRetry(async () => {
      const response = await this.client.get('/api/health'); // наприклад Java має /api/ping
      return response.data;
    });
  }
}
