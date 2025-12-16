import { S2CCommonEvents } from "src/common/common.interface";

export interface S2CGameEvents extends S2CCommonEvents {
  'game:joined': (payload: { message: string }) => void;
  'game:opponentReady': (payload: { message: string }) => void;
  'game:update': (payload: GameSession) => void;
  'game:result': (payload: { winner: string; loser: string }) => void;
  'game:error': (payload: { message: string }) => void;
  'game:opponentDisconnected': (payload: { message: string }) => void;
}

export interface C2SGameEvents {
  'game:join': (payload: { roomId: string; playerName: string }) => void;
  'game:move': (payload: {
    roomId: string;
    move: string;
    playerName: string;
  }) => void;
}

export interface GameSession {
  gameId: string;
  whitePlayer: {
    name: string;
    socketId: string | null;
    isCurrent: boolean;
  };
  blackPlayer: {
    name: string;
    socketId: string | null;
    isCurrent: boolean;
  };
  fen: string | null;
  legalMoves: string[] | null;
}