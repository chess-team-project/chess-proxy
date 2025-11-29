
import { Module, Scope } from '@nestjs/common';
import * as winston from 'winston';
import { CusromLoggerService } from './logger.service';
import { WINSTON_INSTANCE } from '../constants';
import { ConfigService } from '@nestjs/config';

@Module({
  providers: [
    {
      inject: [ConfigService],
      provide: WINSTON_INSTANCE,
      useFactory: (configService: ConfigService) => {
        const logLevel = configService.get('LOG_LEVEL') || 'info';

        return winston.createLogger({
          transports: [new winston.transports.Console()],
          level: logLevel,
          format: winston.format.combine(
            winston.format.colorize({ all: true }),
            winston.format.printf(({ level, message, context }) => {
              return `${level.toUpperCase()} [${context || '-'}] ${message}`;
            }),
          ),
        })
      },
      scope: Scope.DEFAULT
    },
    CusromLoggerService,
  ],
  exports: [CusromLoggerService],
})
export class LoggerModule { }