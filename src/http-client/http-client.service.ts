import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

@Injectable()
export class HttpClientService {
  private readonly logger = new Logger(HttpClientService.name);
  private readonly client: AxiosInstance;
  private readonly JAVA_TOKEN: string;

  constructor(
    private configService: ConfigService
  ) {
    this.client = axios.create({
      baseURL: this.configService.getOrThrow<string>('JAVA_URL'),
      timeout: 1000,
    });
    this.JAVA_TOKEN=configService.getOrThrow<string>('JAVA_TOKEN')
  }

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

  async getJavaHealth() {
    return this.withRetry(async () => {
      const response = await this.client.get('/api/health');
      return response.data;
    });
  }


  async createGame(gameId: string) {
    return this.withRetry(async () => {
      const response = await this.client.post(
        `/api/game/create/${encodeURIComponent(gameId)}`,
        undefined,
        {
          headers: {
            Authorization: this.JAVA_TOKEN,
          },
        },
      );
      return response.data;
    });
  }

  async getGameState(gameId: string) {
    return this.withRetry(async () => {
      const response = await this.client.get(
        `/api/game/state/${encodeURIComponent(gameId)}`,
        {
          headers: {
            Authorization: this.JAVA_TOKEN,
          },
        },
      );
      return response.data;
    });
  }

  async makeMove(gameId: string, move: string) {
    return this.withRetry(async () => {
      const response = await this.client.post(
        `/api/game/move/${encodeURIComponent(gameId)}`,
        { move },
        {
          headers: {
            Authorization: this.JAVA_TOKEN,
            'Content-Type': 'application/json',
          },
        },
      );
      return response.data;
    });
  }
}
