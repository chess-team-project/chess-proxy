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

@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
@UseFilters(new WsValidationExceptionFilter())
@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/game',
})
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  io: Server<C2SGameEvents, S2CGameEvents>;

  handleConnection(client: Socket<C2SGameEvents, S2CGameEvents>) {
    console.log(`🟢 Client connected to /game: ${client.id}`);
  }

  handleDisconnect(client: Socket<C2SGameEvents, S2CGameEvents>) {
    console.log(`🔴 Client disconnected from /game: ${client.id}`);
  }

  @SubscribeMessage('game:join')
  async handleGameJoin(
    @ConnectedSocket() client: Socket<C2SGameEvents, S2CGameEvents>,
    @MessageBody() data: GameJoinDto,
  ) {
    console.log(
      `Player ${data.playerName} (${client.id}) joining game room ${data.roomId} on /game`,
    );
    await client.join(data.roomId);

    client.emit('game:joined', {
      message: `You are successfully connected to game ${data.roomId}`,
    });

    client.to(data.roomId).emit('game:opponentReady', {
      message: 'Opponent has connected.',
    });
  }

  @SubscribeMessage('game:move')
  handleGameMove(
    @ConnectedSocket() client: Socket<C2SGameEvents, S2CGameEvents>,
    @MessageBody() data: GameMoveDto,
  ) {
    console.log(
      `Move received in room ${data.roomId} from ${data.playerName}:`,
      data.move,
    );

    client.to(data.roomId).emit('game:moveMade', {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      move: data.move,
      playerName: data.playerName,
    });
  }
}
