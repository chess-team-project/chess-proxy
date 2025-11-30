import { Module } from '@nestjs/common';
import { HttpClientService } from './http-client.service';
import { HttpClientController } from './http-client.controller';
import { LoggerModule } from 'src/common/logger/logger.mogule';

@Module({
  imports: [LoggerModule],
  controllers: [HttpClientController],
  providers: [HttpClientService],
  exports: [HttpClientService],
})
export class HttpClientModule { }

