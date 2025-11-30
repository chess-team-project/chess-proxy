import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { CusromLoggerService } from 'src/common/logger/logger.service';

@Injectable()
export class HttpClientService {
  private readonly client: AxiosInstance;
  private readonly JAVA_TOKEN: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: CusromLoggerService,
  ) {
    this.logger.setContext(HttpClientService.name);
    this.client = axios.create({
      baseURL: this.configService.getOrThrow<string>('JAVA_URL'),
      timeout: 1000,
    });
    this.JAVA_TOKEN = configService.getOrThrow<string>('JAVA_TOKEN')
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
      const response = await this.client.get<{ status: string }>('/api/health');
      return response.data;
    });
  }


  async createGame(gameId: string) {
    return this.withRetry(async () => {
      const response = await this.client.post<{ fen: string, legalMoves: string[], gameId: string }>(
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
      const response = await this.client.get<{ fen: string, legalMoves: string[] }>(
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
      const response = await this.client.post<{ fen: string, legalMoves: string[] }>(
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
  async deleteGame(gameId: string) {
    return this.withRetry(async () => {
      const response = await this.client.post<{ message: string }>(
        `/api/game/move/${encodeURIComponent(gameId)}`,
        {
          headers: {
            Authorization: this.JAVA_TOKEN,
          },
        },
      );
      return response.data;
    });
  }
}
