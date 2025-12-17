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
      timeout: 5000,
    });

    this.JAVA_TOKEN = this.configService.getOrThrow<string>('JAVA_TOKEN');
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
      } catch (error: any) {
        lastError = error;

        const status = error?.response?.status;
        const data = error?.response?.data;
        this.logger.warn(
          `HTTP request failed attempt ${attempt}/${retries}: ${error?.message ?? error} status=${status} data=${JSON.stringify(data)}`,
        );

        if (attempt < retries) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }

    this.logger.error('All retry attempts failed', lastError);
    throw lastError;
  }

  private authHeaders(extra?: Record<string, string>) {
    return {
      Authorization: this.JAVA_TOKEN,
      ...(extra ?? {}),
    };
  }

  async getJavaHealth() {
    return this.withRetry(async () => {
      const response = await this.client.get<{ status: string }>('/api/health');
      return response.data;
    });
  }

  async createGame(gameId: string) {
    return this.withRetry(async () => {
      const response = await this.client.post<{
        fen: string;
        legalMoves: string[];
        gameId: string;
      }>(
        `/api/game/create/${encodeURIComponent(gameId)}`,
        undefined,
        { headers: this.authHeaders() },
      );
      return response.data;
    });
  }

  async getGameState(gameId: string) {
    return this.withRetry(async () => {
      const response = await this.client.get<{ fen: string; legalMoves: string[] }>(
        `/api/game/state/${encodeURIComponent(gameId)}`,
        { headers: this.authHeaders() },
      );
      return response.data;
    });
  }

  // ✅ move формат у вас зараз { move: "e2e4" }
  async makeMove(gameId: string, move: string) {
    return this.withRetry(async () => {
      const response = await this.client.post<{ fen: string; legalMoves: string[] }>(
        `/api/game/move/${encodeURIComponent(gameId)}`,
        { move },
        {
          headers: this.authHeaders({ 'Content-Type': 'application/json' }),
        },
      );
      return response.data;
    });
  }

  // ✅ DRAW OFFER: POST /api/game/{gameId}/draw/offer
  async offerDraw(gameId: string) {
    return this.withRetry(async () => {
      const response = await this.client.post<{
        message: string;
        gameState?: any;
      }>(
        `/api/game/${encodeURIComponent(gameId)}/draw/offer`,
        undefined,
        { headers: this.authHeaders() },
      );
      return response.data;
    });
  }

  // ✅ DRAW ACCEPT: POST /api/game/{gameId}/draw/accept
  async acceptDraw(gameId: string) {
    return this.withRetry(async () => {
      const response = await this.client.post<{
        message: string;
        gameState?: any;
      }>(
        `/api/game/${encodeURIComponent(gameId)}/draw/accept`,
        undefined,
        { headers: this.authHeaders() },
      );
      return response.data;
    });
  }

  // (опційно) якщо у вас є ендпоїнт видалення гри — тут має бути правильний шлях
  async deleteGame(gameId: string) {
    return this.withRetry(async () => {
      // ⚠️ Тут я залишаю як "placeholder", бо в Java-коді, який ти показував, DELETE endpoint нема.
      // Якщо ви додасте: DELETE /api/game/{id}, тоді заміни на нього.
      const response = await this.client.delete<{ message: string }>(
        `/api/game/${encodeURIComponent(gameId)}`,
        { headers: this.authHeaders() },
      );
      return response.data;
    });
  }
}
