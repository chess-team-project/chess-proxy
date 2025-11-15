import { CreateLobbyDto } from './dto/create-lobby.dto';
import { JoinLobbyDto } from './dto/join-lobby.dto';

export interface S2CLobbyEvents {
  'lobby:created': (payload: {
    roomId: string;
    players: Player[];
    message: string;
  }) => void;
  'lobby:update': (payload: {
    roomId: string;
    players: Player[];
    message: string;
  }) => void;
  'lobby:error': (payload: { message: string }) => void;
  'game:start': (payload: {
    roomId: string;
    white: Player;
    black: Player;
  }) => void;
}

export interface C2SLobbyEvents {
  'lobby:create': (payload: CreateLobbyDto, ack: () => void) => void; // Added ack for example
  'lobby:join': (payload: JoinLobbyDto) => void;
}

export interface Player {
  id: string; // Socket.id
  name: string;
}

export interface LobbyRoom {
  roomId: string;
  players: Player[];
  status: 'waiting' | 'ingame';
}
