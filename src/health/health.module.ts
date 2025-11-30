import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { StartupHealthService } from './startup-health-check.service';
import { HttpClientModule } from 'src/http-client/http-client.module';
import { LoggerModule } from 'src/common/logger/logger.mogule';

@Module({
  imports: [HttpClientModule, LoggerModule],
  providers: [StartupHealthService],
  controllers: [HealthController],
})
export class HealthModule { }
