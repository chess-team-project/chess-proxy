import { UseFilters, UsePipes, ValidationPipe } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { WsValidationExceptionFilter } from 'src/common/ws-validation.filter';
import { C2SGameEvents, S2CGameEvents } from './game.interfaces';
import { GameJoinDto } from './dto/game-join.dto';
import { GameMoveDto } from './dto/game-move.dto';
import { HttpClientService } from 'src/http-client/http-client.service';
import { CusromLoggerService } from 'src/common/logger/logger.service';
import { GameStateService } from './game-state.service';

@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
@UseFilters(new WsValidationExceptionFilter())
@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/game',
})
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
  constructor(
    private readonly httpClientService: HttpClientService,
    private readonly logger: CusromLoggerService,
    private readonly gameStateService: GameStateService,
  ) {
    this.logger.setContext(GameGateway.name);
  }

  @WebSocketServer()
  io: Server<C2SGameEvents, S2CGameEvents>;

  handleConnection(client: Socket<C2SGameEvents, S2CGameEvents>) {
    // Debug - технічна інфа
    this.logger.debug(`🟢 [Game] Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket<C2SGameEvents, S2CGameEvents>) {
    // Debug - технічна інфа
    this.logger.debug(`🔴 [Game] Client disconnected: ${client.id}`);
    const gameId = this.gameStateService.handleDisconnect(client.id);
    if (gameId) {
       this.logger.warn(`Game ${gameId} interrupted by disconnect of ${client.id}`);
       this.io.to(gameId).emit('game:opponentDisconnected', { message: 'Opponent disconnected' });
    }
  }

  @SubscribeMessage('game:join')
  async handleGameJoin(
    @ConnectedSocket() client: Socket<C2SGameEvents, S2CGameEvents>,
    @MessageBody() data: GameJoinDto,
  ) {
    const { roomId, playerName } = data;
    this.logger.debug(`Player ${playerName} attempting to join game ${roomId}`);

    const color = this.gameStateService.registerPlayerSocket(roomId, playerName, client.id);

    if (!color) {
      this.logger.warn(`Access denied: Player ${playerName} tried to join ${roomId} but wasn't found in state.`);
      client.emit('game:error', { message: 'Access denied: You are not part of this game.' });
      client.disconnect();
      return;
    }

    await client.join(roomId);

    const game = this.gameStateService.getGame(roomId);

    if (!game) {
      this.logger.error(`Logic Error: Game ${roomId} not found after successful register.`);
      client.emit('game:error', { message: `Game with id: ${roomId} not found` });
      return;
    }

    client.emit('game:joined', { message: 'You successfully joined to game' });

    client.to(roomId).emit('game:opponentReady', {
      message: `${playerName} connected.`,
    });
    
    // Відправляємо актуальний стан тому, хто приєднався
    client.emit('game:update', game);
    
    this.logger.log(`🎮 Player ${playerName} (${color}) joined game ${roomId}. Ready to play.`);
  }

  @SubscribeMessage('game:move')
  async handleGameMove(
    @ConnectedSocket() client: Socket<C2SGameEvents, S2CGameEvents>,
    @MessageBody() data: GameMoveDto,
  ) {
    const { roomId, move, playerName } = data;
    // Debug для частотних подій, щоб не засмічувати лог, якщо гра активна
    this.logger.debug(`Player ${playerName} requesting move ${move} in game ${roomId}`);

    const isTurn = this.gameStateService.isPlayerTurn(roomId, client.id);
    if (!isTurn) {
        this.logger.warn(`⛔ Out of turn: Player ${playerName} tried ${move} in ${roomId}`);
        client.emit('game:error', { message: 'Not your turn!' });
        return;
    }

    try {
        // Вже є у HttpClient, але тут можна залишити як debug
        // this.logger.debug(`Sending move ${move} to Java...`); 
        
        const result = await this.httpClientService.makeMove(roomId, move);

        const game = this.gameStateService.updateGameState(roomId, result.fen, result.legalMoves);

        if (!game) {
           throw new Error(`Game session ${roomId} lost during update.`);
        }

        this.io.to(roomId).emit('game:update', game);
        
        // Log успішного ходу - це важливо для історії гри
        this.logger.log(`♟️ Move ${move} accepted in ${roomId}.`);

    } catch (error) {
        this.logger.error(
            `🔥 Move failed in ${roomId}: ${error.message}`, 
            error instanceof Error ? error.stack : undefined
        );
        client.emit('game:error', { message: 'Invalid move or server error' });
    }
  }
}