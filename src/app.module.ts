import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { GameGateway } from './game/game.gateway';
import { LobbyGateway } from './lobby/lobby.gateway';
import { HealthModule } from './health/health.module';
import { HttpClientModule } from './http-client/http-client.module';
import { WinstonLoggerService } from './common/logger.service'; 
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    HealthModule,
    HttpClientModule,
    ConfigModule.forRoot({
      isGlobal: true
    }),
  ],
  controllers: [AppController],
  providers: [AppService, GameGateway, LobbyGateway, WinstonLoggerService],
})
export class AppModule {}