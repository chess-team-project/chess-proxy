
import { Injectable, LoggerService, Scope } from '@nestjs/common';
import * as winston from 'winston';

@Injectable({ scope: Scope.TRANSIENT })
export class WinstonLoggerService implements LoggerService { 
  private readonly logger: winston.Logger;

  constructor(private context?: string) {
    this.logger = winston.createLogger({
      level: 'debug',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ level, message, context, timestamp }) => {
          return `[CHESS-PROXY] ${timestamp} [${level.toUpperCase()}] [${context || this.context}] ${message}`;
        }),
      ),
      transports: [
        new winston.transports.Console(),
      ],
    });
  }

  setContext(context: string) {
    this.context = context;
  }

  log(message: string, context?: string) {
    this.logger.info(message, { context: context || this.context });
  }

  error(message: string, trace?: string, context?: string) {
    this.logger.error(message, { trace, context: context || this.context });
  }

  warn(message: string, context?: string) {
    this.logger.warn(message, { context: context || this.context });
  }

  debug(message: string, context?: string) {
    this.logger.debug(message, { context: context || this.context });
  }
}