import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const isHttp = exception instanceof HttpException;
    const status = isHttp ? (exception as HttpException).getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = isHttp ? (exception as HttpException).getResponse() : null;

    this.logger.error(
      isHttp ? (exception as HttpException).message : String(exception),
      exception instanceof Error ? exception.stack : undefined,
    );

    const isProd = process.env.NODE_ENV === 'production';

    response.status(status).json({
      statusCode: status,
      message:
        typeof body === 'object' && body !== null && 'message' in body
          ? (body as { message: unknown }).message
          : isProd
            ? 'Internal server error'
            : String(exception),
      timestamp: new Date().toISOString(),
    });
  }
}
