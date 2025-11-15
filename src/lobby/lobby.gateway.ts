import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

interface LobbyRoom {
  id: string;
  players: string[];
}

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/lobby',
})
export class LobbyGateway {
  @WebSocketServer()
  io: Server;

  private rooms: Record<string, LobbyRoom> = {};

  private generateRoomId(): string {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  handleConnection(client: Socket) {
    console.log('🟢 Client connected to /lobby:', client.id);
  }

  handleDisconnect(client: Socket) {
    console.log('🔴 Client disconnected:', client.id);
  }

  // CREATE ROOM
  @SubscribeMessage('lobby:create')
  handleCreateRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { name: string },
  ) {
    const roomId = this.generateRoomId();

    this.rooms[roomId] = {
      id: roomId,
      players: [client.id],
    };

    client.join(roomId);

    console.log(`🏠 Room created ${roomId} by ${client.id}`, data);

    client.emit('lobby:created', {
      roomId,
      players: this.rooms[roomId].players,
      message: `Room ${roomId} created`,
    });
  }

  // JOIN ROOM
  @SubscribeMessage('lobby:join')
  handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() rawData: any,
  ) {
    let data = rawData;

    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch {
        console.error('Failed to parse JSON string');
        client.emit('lobby:error', { message: 'Invalid data format' });
        return;
      }
    }

    if (!data || typeof data !== 'object' || !data.roomId) {
      console.log('❌ Invalid or missing data.roomId in payload:', data);
      client.emit('lobby:error', { message: 'Room ID is missing or invalid' });
      return;
    }

    console.log('👋 handleJoinRoom() RAW payload:', data);
    console.log('   Rooms object keys:', Object.keys(this.rooms));

    const roomIdFromClient = data.roomId as string;
    const room = this.rooms[roomIdFromClient];

    console.log('   Looking for room with id =', roomIdFromClient);

    if (!room) {
      client.emit('lobby:error', {
        message: `Room ${roomIdFromClient} not found`,
      });
      return;
    }

    room.players.push(client.id);
    client.join(roomIdFromClient);

    console.log(
      `✅ Player ${client.id} joined room ${roomIdFromClient}. Players:`,
      room.players,
    );

    this.io.to(roomIdFromClient).emit('lobby:joined', {
      roomId: roomIdFromClient,
      players: room.players,
      hello: `Вітаю, ${data.name || 'гравцю'}! Ви в лобі ${roomIdFromClient}.`,
    });

    if (room.players.length === 2) {
      console.log(`♟️ Starting game in room ${roomIdFromClient}`);
      this.io.to(roomIdFromClient).emit('game:start', {
        roomId: roomIdFromClient,
        white: room.players[0],
        black: room.players[1],
      });
    }
  }
}
