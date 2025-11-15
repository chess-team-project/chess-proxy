import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { GameGateway } from './game/game.gateway';
import { LobbyGateway } from './lobby/lobby.gateway';
import { HealthModule } from './health/health.module';
import { HttpClientModule } from './http-client/http-client.module';

@Module({
  imports: [
    HealthModule,
    HttpClientModule,
  ],
  controllers: [AppController],
  providers: [AppService, GameGateway, LobbyGateway],
})
export class AppModule {}


