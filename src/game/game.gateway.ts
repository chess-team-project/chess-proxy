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
import { GameStateService } from './game-state.service'; // Імпортуємо

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

  handleConnection(client: Socket) {
    this.logger.log(`🟢 Client connected to /game: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`🔴 Client disconnected from /game: ${client.id}`);
    const gameId = this.gameStateService.handleDisconnect(client.id);
    if (gameId) {
       this.io.to(gameId).emit('game:opponentDisconnected', { message: 'Opponent disconnected' });
    }
  }

  @SubscribeMessage('game:join')
  async handleGameJoin(
    @ConnectedSocket() client: Socket<C2SGameEvents, S2CGameEvents>,
    @MessageBody() data: GameJoinDto,
  ) {
    const { roomId, playerName } = data;
    this.logger.debug(`Player ${playerName} joining game ${roomId}`);

    const color = this.gameStateService.registerPlayerSocket(roomId, playerName, client.id);

    if (!color) {
      client.emit('game:error', { message: 'Access denied: You are not part of this game.' });
      client.disconnect();
      return;
    }

    await client.join(roomId);

    const game = this.gameStateService.getGame(roomId);

    client.emit('game:joined', {
      color: color,
      fen: game.fen,
      legalMoves: game.legalMoves,
      isMyTurn: (color === 'white' && game.whitePlayer.isCurrent) || (color === 'black' && game.blackPlayer.isCurrent)
    });

    client.to(roomId).emit('game:opponentReady', {
      message: `${playerName} connected.`,
    });
    
    this.logger.log(`✅ Player ${playerName} (${color}) joined game ${roomId}`);
  }

  @SubscribeMessage('game:move')
  async handleGameMove(
    @ConnectedSocket() client: Socket<C2SGameEvents, S2CGameEvents>,
    @MessageBody() data: GameMoveDto,
  ) {
    const { roomId, move, playerName } = data; // playerName тут для логів, вірити йому не можна

    // 1. ВАЛІДАЦІЯ: Чи це черга цього сокета?
    const isTurn = this.gameStateService.isPlayerTurn(roomId, client.id);
    if (!isTurn) {
        this.logger.warn(`Player ${client.id} tried to move out of turn in room ${roomId}`);
        client.emit('game:error', { message: 'Not your turn!' });
        return;
    }

    try {
        // 2. Відправляємо хід на Java бекенд
        this.logger.debug(`Sending move ${move} to Java for game ${roomId}`);
        const result = await this.httpClientService.makeMove(roomId, move);

        // 3. Оновлюємо наш локальний стейт (міняємо чергу, зберігаємо FEN)
        this.gameStateService.updateGameState(roomId, result.fen, result.legalMoves);

        // 4. Бродкастимо всім новий стан дошки
        this.io.to(roomId).emit('game:update', {
            fen: result.fen,
            lastMove: move,
            legalMoves: result.legalMoves, // Фронтенд має сам зрозуміти, чи це його ходи, або можна фільтрувати
        });
        
        this.logger.log(`Move ${move} made in ${roomId}. New FEN: ${result.fen}`);

    } catch (error) {
        this.logger.error(`Move failed: ${error.message}`);
        client.emit('game:error', { message: 'Invalid move or server error' });
        // Можливо треба повернути попередній FEN клієнту, щоб "відкотити" фігуру назад
    }
  }
}