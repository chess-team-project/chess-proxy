import { GameSession } from 'src/game/game.interfaces';
import { CreateLobbyDto } from './dto/create-lobby.dto';
import { JoinLobbyDto } from './dto/join-lobby.dto';
import { S2CCommonEvents } from 'src/common/common.interface';

export interface S2CLobbyEvents extends S2CCommonEvents {
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
  'game:start': (payload: GameSession) => void;
}

export interface C2SLobbyEvents {
  'lobby:create': (payload: CreateLobbyDto) => void;
  'lobby:join': (payload: JoinLobbyDto) => void;
}

export interface Player {
  id: string;
  name: string;
}

export interface LobbyRoom {
  roomId: string;
  players: Player[];
  status: 'waiting' | 'ingame';
}
