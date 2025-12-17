import { S2CCommonEvents } from 'src/common/common.interface';

export type PlayerColor = 'white' | 'black';

export type GameStatus =
  | 'playing'
  | 'whiteWon'
  | 'blackWon'
  | 'draw'
  | 'timeout';

export interface GameSession {
  gameId: string; // JAVA gameId (uuid)

  whitePlayer: {
    name: string;
    socketId: string | null;
    isCurrent: boolean;
    timeRemaining?: number;
  };

  blackPlayer: {
    name: string;
    socketId: string | null;
    isCurrent: boolean;
    timeRemaining?: number;
  };

  fen: string | null;
  legalMoves: string[] | null;

  drawOfferFrom?: PlayerColor | null;

  gameStatus?: GameStatus;
}

export interface S2CGameEvents extends S2CCommonEvents {
  'game:joined': (payload: { message: string }) => void;
  'game:opponentReady': (payload: { message: string }) => void;

  'game:update': (payload: GameSession) => void;

  'game:result': (payload: { winner: string; loser: string }) => void;

  'game:clock': (payload: { white: number; black: number }) => void;

  'game:draw:offered': (payload: { from: PlayerColor }) => void;

  'game:finished': (payload: {
    message: string;
    winner?: string;
    loser?: string;
    status?: GameStatus;
  }) => void;

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

  'game:draw:offer': (payload: { roomId: string }) => void;
  'game:draw:accept': (payload: { roomId: string }) => void;

  'game:resign': (payload: { roomId: string }) => void;
}
