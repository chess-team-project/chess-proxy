import { Catch, ArgumentsHost, Injectable } from '@nestjs/common';
import { BaseWsExceptionFilter } from '@nestjs/websockets';
import { BadRequestException } from '@nestjs/common';
import { Socket } from 'socket.io';
import { S2CCommonEvents } from './common.interface';
import { CusromLoggerService } from 'src/common/logger/logger.service';

@Catch(BadRequestException)
@Injectable()
export class WsValidationExceptionFilter extends BaseWsExceptionFilter {
  constructor(private readonly logger: CusromLoggerService) {
    super();
    this.logger.setContext(WsValidationExceptionFilter.name);
  }

  catch(exception: BadRequestException, host: ArgumentsHost) {
    const client = host.switchToWs().getClient<Socket<{}, S2CCommonEvents>>();
    const errorResponse = exception.getResponse();

    let validationMessages: string | string[] = 'Validation failed';

    if (
      typeof errorResponse === 'object' &&
      errorResponse !== null &&
      'message' in errorResponse
    ) {
      const msg = (errorResponse as { message: unknown }).message;

      if (typeof msg === 'string' || Array.isArray(msg)) {
        validationMessages = msg;
      }
    }

    client.emit('err', {
      message: JSON.stringify(validationMessages),
    });
    this.logger.warn(`WS validation error: ${JSON.stringify(validationMessages)}`);
  }
}
