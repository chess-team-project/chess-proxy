import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { GameGateway } from './game/game.gateway';
import { LobbyGateway } from './lobby/lobby.gateway';
import { HealthModule } from './health/health.module';
import { HttpClientModule } from './http-client/http-client.module';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from './common/logger/logger.mogule';
import { GameModule } from './game/game.module';

@Module({
  imports: [
    HealthModule,
    HttpClientModule,
    ConfigModule.forRoot({
      isGlobal: true
    }),
    LoggerModule,
    GameModule,
  ],
  controllers: [AppController],
  providers: [AppService, LobbyGateway],
})
export class AppModule {}