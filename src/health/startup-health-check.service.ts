import { Injectable, OnModuleInit } from '@nestjs/common';
import { HttpClientService } from 'src/http-client/http-client.service';
import { CusromLoggerService } from 'src/common/logger/logger.service';

@Injectable()
export class StartupHealthService implements OnModuleInit {
  constructor(
    private readonly http: HttpClientService,
    private readonly logger: CusromLoggerService,
  ) {
    logger.setContext(StartupHealthService.name)
  }

  async onModuleInit() {
    this.logger.log('Running startup health check...');

    const healthy = await this.isBackendHealthy();
    if (!healthy) {
      this.logger.error('Java backend is DOWN. Aborting startup.');
      throw new Error('Backend health check failed');
    }

    this.logger.log('Java backend is UP. Continuing startup.');
  }

  private async isBackendHealthy(): Promise<boolean> {
    try {
      const res = await this.http.getJavaHealth();
      if (res.status === 'UP') return true;
      return !!res;
    } catch {
      return false;
    }
  }
}