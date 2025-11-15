type ChessMove = any; // You can make this more specific, e.g., { from: string, to: string }

export interface S2CGameEvents {
  'game:joined': (payload: { message: string }) => void;
  'game:opponentReady': (payload: { message: string }) => void;
  'game:moveMade': (payload: { move: ChessMove; playerName: string }) => void;
  'game:error': (payload: { message: string }) => void;
}

export interface C2SGameEvents {
  'game:join': (payload: { roomId: string; playerName: string }) => void;
  'game:move': (payload: {
    roomId: string;
    move: ChessMove;
    playerName: string;
  }) => void;
}
