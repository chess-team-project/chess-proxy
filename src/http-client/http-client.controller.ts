import { Controller, Get, Post, Body } from '@nestjs/common';
import { HttpClientService } from './http-client.service';

@Controller('java')
export class HttpClientController {
  constructor(private readonly httpClient: HttpClientService) {}

  // GET /java/ping -> проксі до Java /api/ping
  @Get('ping')
  async ping() {
    return this.httpClient.getJavaHealth();
  }
}
