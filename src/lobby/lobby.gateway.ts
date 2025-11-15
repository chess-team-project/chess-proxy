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
import {
  UsePipes,
  ValidationPipe,
  UseFilters,
} from '@nestjs/common';
import { WsValidationExceptionFilter } from 'src/common/ws-validation.filter';

@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
@UseFilters(new WsValidationExceptionFilter())
@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/lobby',
})
export class LobbyGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  io: Server<C2SLobbyEvents, S2CLobbyEvents>;

  private static rooms: Map<string, LobbyRoom> = new Map();

  private generateRoomId(): string {
    return Math.random().toString(36).substring(2, 6).toUpperCase();
  }

  handleConnection(client: Socket<C2SLobbyEvents, S2CLobbyEvents>) {
    console.log(`🟢 Client connected to /lobby: ${client.id}`);
  }

  handleDisconnect(client: Socket<C2SLobbyEvents, S2CLobbyEvents>) {
    console.log(`🔴 Client disconnected from /lobby: ${client.id}`);

    LobbyGateway.rooms.forEach((room, roomId) => {
      const playerIndex = room.players.findIndex((p) => p.id === client.id);

      if (playerIndex !== -1) {
        console.log(`Player ${client.id} leaving room ${roomId}`);
        room.players.splice(playerIndex, 1);

        if (room.players.length === 0) {
          LobbyGateway.rooms.delete(roomId);
          console.log(`Room ${roomId} is empty, deleting.`);
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
  handleCreateRoom(
    @ConnectedSocket() client: Socket<C2SLobbyEvents, S2CLobbyEvents>,
    @MessageBody() data: CreateLobbyDto,
  ) {
    // --- 🔽 НОВА ПЕРЕВІРКА (Constraint 2) 🔽 ---
    // Перевіряємо, чи цей клієнт (socket.id) вже є в якійсь кімнаті
    const clientId = client.id;
    for (const room of LobbyGateway.rooms.values()) {
      if (room.players.some((p) => p.id === clientId)) {
        client.emit('lobby:error', {
          message: `You are already in a lobby (${room.roomId}). Cannot create another.`,
        });
        return; // Зупиняємо створення
      }
    }
    // --- 🔼 КІНЕЦЬ ПЕРЕВІРКИ 🔼 ---

    const roomId = this.generateRoomId();
    const player: Player = { id: client.id, name: data.name };

    const newRoom: LobbyRoom = {
      roomId: roomId,
      players: [player],
      status: 'waiting',
    };

    LobbyGateway.rooms.set(roomId, newRoom);
    client.join(roomId);

    console.log(`🏠 Room created ${roomId} by ${player.name} (${client.id})`);

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

    console.log(
      `👋 Player ${name} (${client.id}) trying to join room ${roomId}`,
    );

    if (!room) {
      client.emit('lobby:error', { message: `Room ${roomId} not found` });
      return;
    }

    // --- 🔽 НОВА ПЕРЕВІРКА (Constraint 1) 🔽 ---
    // Перевіряємо, чи ім'я вже зайняте в ЦІЙ кімнаті (нечутливо до регістру)
    const nameInUse = room.players.some(
      (p) => p.name.toLowerCase() === name.toLowerCase(),
    );
    if (nameInUse) {
      client.emit('lobby:error', {
        message: `The name "${name}" is already taken in this lobby.`,
      });
      return; // Зупиняємо приєднання
    }
    // --- 🔼 КІНЕЦЬ ПЕРЕВІРКИ 🔼 ---

    if (room.players.length >= 2) {
      client.emit('lobby:error', { message: `Room ${roomId} is full` });
      return;
    }

    const newPlayer: Player = { id: client.id, name: name };
    room.players.push(newPlayer);
    client.join(roomId);

    console.log(`✅ Player ${newPlayer.name} joined room ${roomId}.`);

    this.io.to(roomId).emit('lobby:update', {
      roomId: room.roomId,
      players: room.players,
      message: `${newPlayer.name} joined.`,
    });

    if (room.players.length === 2) {
      room.status = 'ingame';
      console.log(`🚀 Room ${roomId} is full. Calling create game stub...`);

      try {
        await new Promise((resolve) => setTimeout(resolve, 500));

        console.log(`✅ Game service stub confirmed game ${roomId} creation.`);

        this.io.to(roomId).emit('game:start', {
          roomId: room.roomId,
          white: room.players[0],
          black: room.players[1],
        });

        LobbyGateway.rooms.delete(roomId);
        console.log(`🧹 Lobby ${roomId} destroyed after game start.`);
      } catch (error) {
        console.error('Error in game creation stub:', error.message);
        this.io.to(roomId).emit('lobby:error', {
          message: 'Failed to create game. Please try again.',
        });
        room.status = 'waiting';
        room.players = [room.players[0]];
      }
    }
  }
}