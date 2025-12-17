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
@UseFilters(WsValidationExceptionFilter)
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

 private dumpRooms(client: Socket, roomId: string) {
  try {
    // 🛡️ захист від undefined (ГОЛОВНЕ виправлення)
    if (!this.io || !this.io.sockets || !this.io.sockets.adapter) {
      this.logger.warn(
        `[ROOM] adapter not ready | roomId=${roomId} | client=${client?.id}`,
      );
      return;
    }

    const roomMembers = this.io.sockets.adapter.rooms.get(roomId);
    const membersArray = roomMembers ? Array.from(roomMembers) : [];

    this.logger.log(
      `[ROOM] roomId=${roomId} members=${JSON.stringify(membersArray)}`,
    );

    this.logger.log(
      `[ROOM] client=${client.id} rooms=${JSON.stringify(
        Array.from(client.rooms),
      )}`,
    );
  } catch (err: any) {
    this.logger.error(
      `[ROOM] dumpRooms failed | roomId=${roomId} | client=${client?.id}`,
      err,
    );
  }
}

handleConnection(client: Socket<C2SGameEvents, S2CGameEvents>) {
  this.logger.debug(`🟢 Client connected: ${client.id}`);
}

handleDisconnect(client: Socket<C2SGameEvents, S2CGameEvents>) {
  this.logger.debug(`🔴 Client disconnected: ${client.id}`);

  const javaGameId = this.gameStateService.handleDisconnect(client.id);
  if (!javaGameId) return;

  this.logger.warn(
    `Game ${javaGameId} interrupted by disconnect of ${client.id}`,
  );

  // ⚠️ javaGameId ≠ roomId — лог залишаємо, але не ламаємо gateway
  try {
    this.io.to(javaGameId as any).emit('game:opponentDisconnected', {
      message: 'Opponent disconnected',
    });
  } catch (err) {
    this.logger.error(
      `[DISCONNECT] failed emit opponentDisconnected gameId=${javaGameId}`,
      err,
    );
  }
}

  // --------------------------
  // JOIN
  // --------------------------
  @SubscribeMessage('game:join')
  async handleGameJoin(
    @ConnectedSocket() client: Socket<C2SGameEvents, S2CGameEvents>,
    @MessageBody() data: GameJoinDto,
  ) {
    const { roomId, playerName } = data;
    this.logger.log(`[JOIN] start client=${client.id} roomId=${roomId} name=${playerName}`);

    const color = this.gameStateService.registerPlayerSocket(roomId, playerName, client.id);
    this.logger.log(`[JOIN] registerPlayerSocket color=${color}`);

    if (!color) {
      this.logger.warn(`[JOIN] denied player=${playerName} roomId=${roomId}`);
      client.emit('game:error', { message: 'Access denied: You are not part of this game.' });
      client.disconnect();
      return;
    }

    await client.join(roomId);
    this.logger.log(`[JOIN] joined room=${roomId} client=${client.id}`);
    this.dumpRooms(client, roomId);

    const game = this.gameStateService.getGame(roomId);
    this.logger.log(`[JOIN] getGame(roomId) found=${!!game} javaGameId=${game?.gameId}`);

    if (!game) {
      client.emit('game:error', { message: `Game with id: ${roomId} not found` });
      return;
    }

    client.emit('game:joined', { message: 'You successfully joined to game' });
    client.to(roomId).emit('game:opponentReady', { message: `${playerName} connected.` });
    client.emit('game:update', game);

    // start clock when both connected
    if (game.whitePlayer.socketId && game.blackPlayer.socketId) {
      this.logger.log(`[JOIN] both connected, starting clock roomId=${roomId}`);
      this.gameStateService.startClock(
        roomId,
        (g) => {
          this.io.to(roomId).emit('game:clock', {
            white: g.whitePlayer.timeRemaining ?? 0,
            black: g.blackPlayer.timeRemaining ?? 0,
          });
        },
        (expiredColor, g) => {
          const loser = expiredColor === 'white' ? g.whitePlayer.name : g.blackPlayer.name;
          const winner = expiredColor === 'white' ? g.blackPlayer.name : g.whitePlayer.name;

          this.logger.warn(`[TIMEOUT] roomId=${roomId} loser=${loser} winner=${winner}`);

          this.io.to(roomId).emit('game:result', { winner, loser });
          this.io.to(roomId).emit('game:finished', {
            message: `${winner} won on time!`,
            winner,
            loser,
            status: 'timeout',
          });

          this.gameStateService.endGame(roomId);
        },
      );
    }

    this.logger.log(`[JOIN] done player=${playerName} color=${color} roomId=${roomId}`);
  }

  // --------------------------
  // MOVE
  // --------------------------
  @SubscribeMessage('game:move')
  async handleGameMove(
    @ConnectedSocket() client: Socket<C2SGameEvents, S2CGameEvents>,
    @MessageBody() data: GameMoveDto,
  ) {
    const { roomId, move, playerName } = data;
    this.logger.log(`[MOVE] start client=${client.id} roomId=${roomId} move=${move} name=${playerName}`);
    this.dumpRooms(client, roomId);

    const gameBefore = this.gameStateService.getGame(roomId);
    if (!gameBefore) {
      client.emit('game:error', { message: `Game ${roomId} not found` });
      return;
    }

    if (gameBefore.gameStatus && gameBefore.gameStatus !== 'playing') {
      client.emit('game:error', { message: 'Game already finished' });
      return;
    }
    const isTurn = this.gameStateService.isPlayerTurn(roomId, client.id);
    if (!isTurn) {
      this.logger.warn(`[MOVE] out of turn roomId=${roomId} client=${client.id}`);
      client.emit('game:error', { message: 'Not your turn!' });
      return;
    }

    try {
      this.logger.log(`[MOVE] calling JAVA makeMove(javaGameId=${gameBefore.gameId})`);
      const result = await this.httpClientService.makeMove(gameBefore.gameId, move);

      this.gameStateService.stopClock(roomId);

      const game = this.gameStateService.updateGameState(roomId, result.fen, result.legalMoves);
      if (!game) throw new Error(`Game session ${roomId} lost during update.`);

      this.io.to(roomId).emit('game:update', game);

      this.logger.log(`[MOVE] applied roomId=${roomId} newLegalMoves=${result.legalMoves?.length ?? 'null'}`);

      // old logic: if no legal moves => finish
      if (Array.isArray(result.legalMoves) && result.legalMoves.length === 0) {
        const winner = playerName;
        const loser = game.whitePlayer.name === winner ? game.blackPlayer.name : game.whitePlayer.name;

        this.logger.warn(`[FINISH] roomId=${roomId} winner=${winner} loser=${loser} reason=noMoves`);

        this.io.to(roomId).emit('game:result', { winner, loser });
        this.io.to(roomId).emit('game:finished', { message: `${winner} wins!`, winner, loser });

        this.gameStateService.endGame(roomId);
      } else {
        // restart clock for next player
        this.gameStateService.startClock(
          roomId,
          (g) => {
            this.io.to(roomId).emit('game:clock', {
              white: g.whitePlayer.timeRemaining ?? 0,
              black: g.blackPlayer.timeRemaining ?? 0,
            });
          },
          (expiredColor, g) => {
            const loser = expiredColor === 'white' ? g.whitePlayer.name : g.blackPlayer.name;
            const winner = expiredColor === 'white' ? g.blackPlayer.name : g.whitePlayer.name;

            this.logger.warn(`[TIMEOUT] roomId=${roomId} loser=${loser} winner=${winner}`);

            this.io.to(roomId).emit('game:result', { winner, loser });
            this.io.to(roomId).emit('game:finished', {
              message: `${winner} won on time!`,
              winner,
              loser,
              status: 'timeout',
            });

            this.gameStateService.endGame(roomId);
          },
        );
      }
    } catch (error: any) {
      this.logger.error(`[MOVE] failed roomId=${roomId} err=${error?.message ?? error}`);
      client.emit('game:error', { message: error?.message || 'Invalid move or server error' });
    }
  }

  // --------------------------
  // DRAW OFFER
  // --------------------------
  @SubscribeMessage('game:draw:offer')
  async handleDrawOffer(
    @ConnectedSocket() client: Socket<C2SGameEvents, S2CGameEvents>,
    @MessageBody() data: { roomId: string },
  ) {
    const { roomId } = data;
    this.logger.log(`[DRAW_OFFER] start client=${client.id} roomId=${roomId}`);
    this.dumpRooms(client, roomId);

    const game = this.gameStateService.getGame(roomId);
    this.logger.log(`[DRAW_OFFER] getGame found=${!!game} javaGameId=${game?.gameId}`);

    if (!game) {
      client.emit('game:error', { message: `Game ${roomId} not found` });
      return;
    }

    const isWhite = game.whitePlayer.socketId === client.id;
    const isBlack = game.blackPlayer.socketId === client.id;

    this.logger.log(`[DRAW_OFFER] isWhite=${isWhite} isBlack=${isBlack} status=${game.gameStatus}`);

    if (!isWhite && !isBlack) {
      client.emit('game:error', { message: 'Only players can offer a draw' });
      return;
    }

    if (game.gameStatus && game.gameStatus !== 'playing') {
      client.emit('game:error', { message: 'Game is not in playing state' });
      return;
    }

    try {
      this.logger.log(`[DRAW_OFFER] calling JAVA offerDraw(javaGameId=${game.gameId})`);
      await this.httpClientService.offerDraw(game.gameId);

      const updated = this.gameStateService.offerDraw(roomId, client.id);
      if (!updated) {
        client.emit('game:error', { message: 'Failed to offer draw' });
        return;
      }

      const from: 'white' | 'black' = isWhite ? 'white' : 'black';

      this.io.to(roomId).emit('game:update', updated);
      this.io.to(roomId).emit('game:draw:offered', { from });

      this.logger.log(`[DRAW_OFFER] emitted to roomId=${roomId} from=${from}`);
      this.dumpRooms(client, roomId);
    } catch (err: any) {
      const backendMsg = err?.response?.data?.error ?? err?.response?.data?.message ?? '';
      const backendStatus = err?.response?.status;

      this.logger.warn(`[DRAW_OFFER] java failed status=${backendStatus} msg=${backendMsg}`);

      // fallback
      if (
        backendStatus === 501 ||
        (typeof backendMsg === 'string' && backendMsg.toLowerCase().includes('not yet implemented'))
      ) {
        const updatedLocal = this.gameStateService.offerDraw(roomId, client.id);
        if (updatedLocal) {
          const from: 'white' | 'black' = isWhite ? 'white' : 'black';
          this.io.to(roomId).emit('game:update', updatedLocal);
          this.io.to(roomId).emit('game:draw:offered', { from });
          this.logger.log(`[DRAW_OFFER] fallback OK roomId=${roomId}`);
          return;
        }
      }

      client.emit('game:error', { message: backendMsg || 'Failed to offer draw' });
    }
  }

  // --------------------------
  // DRAW ACCEPT
  // --------------------------
  @SubscribeMessage('game:draw:accept')
  async handleDrawAccept(
    @ConnectedSocket() client: Socket<C2SGameEvents, S2CGameEvents>,
    @MessageBody() data: { roomId: string },
  ) {
    const { roomId } = data;
    this.logger.log(`[DRAW_ACCEPT] start client=${client.id} roomId=${roomId}`);
    this.dumpRooms(client, roomId);

    const game = this.gameStateService.getGame(roomId);
    this.logger.log(`[DRAW_ACCEPT] getGame found=${!!game} javaGameId=${game?.gameId} offer=${game?.drawOfferFrom}`);

    if (!game) {
      client.emit('game:error', { message: `Game ${roomId} not found` });
      return;
    }

    const isWhite = game.whitePlayer.socketId === client.id;
    const isBlack = game.blackPlayer.socketId === client.id;

    if (!isWhite && !isBlack) {
      client.emit('game:error', { message: 'Only players can accept a draw' });
      return;
    }

    if (!game.drawOfferFrom) {
      client.emit('game:error', { message: 'No draw offer to accept' });
      return;
    }

    const acceptingColor: 'white' | 'black' = isWhite ? 'white' : 'black';
    if (game.drawOfferFrom === acceptingColor) {
      client.emit('game:error', { message: 'Cannot accept your own draw offer' });
      return;
    }

    try {
      this.logger.log(`[DRAW_ACCEPT] calling JAVA acceptDraw(javaGameId=${game.gameId})`);
      await this.httpClientService.acceptDraw(game.gameId);

      const updated = this.gameStateService.acceptDraw(roomId, client.id);
      if (!updated) {
        client.emit('game:error', { message: 'Failed to accept draw' });
        return;
      }

      this.io.to(roomId).emit('game:update', updated);
      this.io.to(roomId).emit('game:finished', { message: 'Draw agreed.', status: 'draw' });

      this.logger.log(`[DRAW_ACCEPT] emitted draw finished roomId=${roomId}`);
    } catch (err: any) {
      const backendMsg = err?.response?.data?.error ?? err?.response?.data?.message ?? '';
      const backendStatus = err?.response?.status;

      this.logger.warn(`[DRAW_ACCEPT] java failed status=${backendStatus} msg=${backendMsg}`);

      // fallback
      if (
        backendStatus === 501 ||
        (typeof backendMsg === 'string' && backendMsg.toLowerCase().includes('not yet implemented'))
      ) {
        const updatedLocal = this.gameStateService.acceptDraw(roomId, client.id);
        if (updatedLocal) {
          this.io.to(roomId).emit('game:update', updatedLocal);
          this.io.to(roomId).emit('game:finished', { message: 'Draw agreed.', status: 'draw' });
          this.logger.log(`[DRAW_ACCEPT] fallback OK roomId=${roomId}`);
          return;
        }
      }

      client.emit('game:error', { message: backendMsg || 'Failed to accept draw' });
    }
  }

  // --------------------------
  // RESIGN
  // --------------------------
  @SubscribeMessage('game:resign')
  handleResign(
    @ConnectedSocket() client: Socket<C2SGameEvents, S2CGameEvents>,
    @MessageBody() data: { roomId: string },
  ) {
    const { roomId } = data || {};
    this.logger.log(`[RESIGN] start client=${client.id} roomId=${roomId}`);
    if (!roomId) {
      client.emit('game:error', { message: 'roomId required' });
      return;
    }

    this.dumpRooms(client, roomId);

    const game = this.gameStateService.getGame(roomId);
    this.logger.log(`[RESIGN] getGame found=${!!game} javaGameId=${game?.gameId} status=${game?.gameStatus}`);

    if (!game) {
      client.emit('game:error', { message: `Game ${roomId} not found` });
      return;
    }

    const result = this.gameStateService.resign(roomId, client.id);
    this.logger.log(`[RESIGN] resign result=${!!result}`);

    if (!result) {
      client.emit('game:error', { message: 'Cannot resign (not a player or game not playing)' });
      return;
    }

    const { winner, loser } = result;

    this.logger.warn(`[RESIGN] winner=${winner} loser=${loser} roomId=${roomId}`);

    this.io.to(roomId).emit('game:update', result.game);
this.io.to(roomId).emit('game:result', { winner, loser });
this.io.to(roomId).emit('game:finished', {
  message: `${winner} wins by resignation.`,
  winner,
  loser,
});

this.gameStateService.endGame(roomId);
this.logger.log(`[RESIGN] game ended roomId=${roomId}`);


    this.logger.log(`[RESIGN] emitted game:update + game:result + game:finished roomId=${roomId}`);
  }
}
