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
import {
  C2SLobbyEvents,
  LobbyRoom,
  Player,
  S2CLobbyEvents,
} from './lobby.interfaces';
import { CreateLobbyDto } from './dto/create-lobby.dto';
import { JoinLobbyDto } from './dto/join-lobby.dto';
import { UsePipes, ValidationPipe, UseFilters } from '@nestjs/common';
import { WsValidationExceptionFilter } from 'src/common/ws-validation.filter';
import { CusromLoggerService } from 'src/common/logger/logger.service';
import { HttpClientService } from 'src/http-client/http-client.service';

@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
@UseFilters(new WsValidationExceptionFilter())
@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/lobby',
})
export class LobbyGateway implements OnGatewayConnection, OnGatewayDisconnect {
  constructor(
    private readonly httpClientService: HttpClientService,
    private readonly logger: CusromLoggerService,
  ) { 
    this.logger.setContext(LobbyGateway.name);
  }

  @WebSocketServer()
  io: Server<C2SLobbyEvents, S2CLobbyEvents>;

  private static rooms: Map<string, LobbyRoom> = new Map();

  private generateRoomId(): string {
    return Math.random().toString(36).substring(2, 6).toUpperCase();
  }

  handleConnection(client: Socket<C2SLobbyEvents, S2CLobbyEvents>) {
    this.logger.log(`🟢 Client connected: ${client.id}`); 
  }

  handleDisconnect(client: Socket<C2SLobbyEvents, S2CLobbyEvents>) {
    this.logger.log(`🔴 Client disconnected: ${client.id}`); 

    LobbyGateway.rooms.forEach((room, roomId) => {
      const playerIndex = room.players.findIndex((p) => p.id === client.id);

      if (playerIndex !== -1) {
        this.logger.warn(`Player ${client.id} leaving room ${roomId}`);
        room.players.splice(playerIndex, 1);

        if (room.players.length === 0) {
          LobbyGateway.rooms.delete(roomId);
          this.logger.warn(`Room ${roomId} is empty, deleting.`); 
        } else {
          room.status = 'waiting';
          this.io.to(roomId).emit('lobby:update', {
            roomId,
            message: `Opponent disconnected.`,
            players: room.players,
          });
        }
      }
    });
  }

  @SubscribeMessage('lobby:create')
  async handleCreateRoom(
    @ConnectedSocket() client: Socket<C2SLobbyEvents, S2CLobbyEvents>,
    @MessageBody() data: CreateLobbyDto,
  ) {
    const clientId = client.id;
    for (const room of LobbyGateway.rooms.values()) {
      if (room.players.some((p) => p.id === clientId)) {
        client.emit('lobby:error', {
          message: `You are already in a lobby (${room.roomId}). Cannot create another.`,
        });
        this.logger.warn(`Client ${clientId} tried to create a room but is already in room ${room.roomId}.`);
        return;
      }
    }

    const roomId = this.generateRoomId();
    const player: Player = { id: client.id, name: data.name };

    const newRoom: LobbyRoom = {
      roomId: roomId,
      players: [player],
      status: 'waiting',
    };

    LobbyGateway.rooms.set(roomId, newRoom);
    await client.join(roomId);

    this.logger.log(`🏠 Room created ${roomId} by ${player.name} (${client.id})`); 

    client.emit('lobby:created', {
      roomId: newRoom.roomId,
      players: newRoom.players,
      message: `Room ${roomId} created`,
    });
  }

  @SubscribeMessage('lobby:join')
  async handleJoinRoom(
    @ConnectedSocket() client: Socket<C2SLobbyEvents, S2CLobbyEvents>,
    @MessageBody() data: JoinLobbyDto,
  ) {
    const { roomId, name } = data;
    const room = LobbyGateway.rooms.get(roomId);

    this.logger.debug( 
      `👋 Player ${name} (${client.id}) trying to join room ${roomId}`,
    );

    if (!room) {
      client.emit('lobby:error', { message: `Room ${roomId} not found` });
      this.logger.warn(`Join failed: Room ${roomId} not found.`); 
      return;
    }

    const nameInUse = room.players.some(
      (p) => p.name.toLowerCase() === name.toLowerCase(),
    );
    if (nameInUse) {
      client.emit('lobby:error', {
        message: `The name "${name}" is already taken in this lobby.`,
      });
      this.logger.warn(`Join failed: Name "${name}" already taken in room ${roomId}.`);
      return;
    }

    if (room.players.length >= 2) {
      client.emit('lobby:error', { message: `Room ${roomId} is full` });
      this.logger.warn(`Join failed: Room ${roomId} is full.`); 
      return;
    }

    const newPlayer: Player = { id: client.id, name: name };
    room.players.push(newPlayer);
    await client.join(roomId);

    this.logger.log(`✅ Player ${newPlayer.name} joined room ${roomId}.`); 

    this.io.to(roomId).emit('lobby:update', {
      roomId: room.roomId,
      players: room.players,
      message: `${newPlayer.name} joined.`,
    });

    if (room.players.length === 2) {
      room.status = 'ingame';
      this.logger.log(`🚀 Room ${roomId} is full. Calling create game stub...`); 

      try {
        const board = await this.httpClientService.createGame(room.roomId)

        this.logger.log(`✅ Game service stub confirmed game ${roomId} creation.`); 
        console.log(`✅ Game service stub confirmed game ${roomId} creation.`);
        console.dir()

        this.io.to(roomId).emit('game:start', {
          roomId: room.roomId,
          white: room.players[0],
          black: room.players[1],
        });

        LobbyGateway.rooms.delete(roomId);
        this.logger.log(`🧹 Lobby ${roomId} destroyed after game start.`); 
      } catch (error) {
        
        this.logger.error(
          `Error in game creation stub for room ${roomId}: ${error?.message || 'unknown error'}`,
          error instanceof Error ? error.stack : undefined,
        );

        this.io.to(roomId).emit('lobby:error', {
          message: 'Failed to create game. Please try again.',
        });
        room.status = 'waiting';
        room.players = [room.players[0]];
      }
    }
  }
}