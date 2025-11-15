import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';

@Controller()
export class HealthController {
  private isDependenciesReady = true;

  @Get('/health')
  getHealth() {
    return {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }

  @Get('/ready')
  getReady() {
    if (!this.isDependenciesReady) {
      throw new ServiceUnavailableException({
        status: 'not ready',
        details: {
          database: 'Database connection failed or not initialized.',
        },
        timestamp: new Date().toISOString(),
      });
    }

    return {
      status: 'ready',
      timestamp: new Date().toISOString(),
      details: {
        database: 'OK',
      },
    };
  }
}
