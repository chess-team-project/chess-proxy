import { Injectable, Inject, Scope, LoggerService } from '@nestjs/common';
import * as winston from 'winston';
import { WINSTON_INSTANCE } from '../constants';

@Injectable({ scope: Scope.TRANSIENT })
export class CusromLoggerService implements LoggerService {
  private context?: string;

  constructor(
    @Inject(WINSTON_INSTANCE) private readonly winston: winston.Logger
  ) {}

  setContext(context: string) {
    this.context = context;
  }
  // 0
  error(message: string, trace?: string, context?: string) {
    this.winston.error(message, { trace, context: context || this.context });
  }
  // 1
  warn(message: string, context?: string) {
    this.winston.warn(message, { context: context || this.context });
  }
  // 2
  log(message: string, context?: string) {
    this.winston.info(message, { context: context || this.context });
  }
  // 5
  debug(message: string, context?: string) {
    this.winston.debug(message, { context: context || this.context });
  }
}