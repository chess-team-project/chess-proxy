// src/ws-validation.filter.ts
import { Catch, ArgumentsHost } from '@nestjs/common';
import { BaseWsExceptionFilter } from '@nestjs/websockets';
import { BadRequestException } from '@nestjs/common';
import { Socket } from 'socket.io';

@Catch(BadRequestException)
export class WsValidationExceptionFilter extends BaseWsExceptionFilter {
  catch(exception: BadRequestException, host: ArgumentsHost) {
    const client = host.switchToWs().getClient<Socket>();
    const errorResponse = exception.getResponse();

    let validationMessages: string | string[] = 'Validation failed';

    // 🔽 Оновлена логіка:
    // Безпечно перевіряємо, чи є errorResponse об'єктом,
    // і чи є у нього властивість 'message'.
    if (
      typeof errorResponse === 'object' &&
      errorResponse !== null &&
      'message' in errorResponse
    ) {
      // Тільки тепер ми безпечно отримуємо 'message'.
      // Типізуємо 'message' як 'unknown', щоб linter був щасливий
      const msg = (errorResponse as { message: unknown }).message;

      // Перевіряємо, чи 'message' є рядком або масивом рядків
      if (typeof msg === 'string' || Array.isArray(msg)) {
        validationMessages = msg;
      }
    }

    client.emit('lobby:error', {
      event: 'validation:error',
      message: validationMessages,
    });
  }
}
