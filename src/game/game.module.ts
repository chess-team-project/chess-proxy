
import { GameGateway } from "./game.gateway";
import { GameStateService } from "./game-state.service";
import { Module } from "@nestjs/common";
import { HttpClientModule } from "src/http-client/http-client.module";
import { LoggerModule } from "src/common/logger/logger.mogule";

@Module({
  imports:[HttpClientModule, LoggerModule],
  providers: [GameGateway, GameStateService],
  exports: [GameStateService],
})
export class GameModule {}  