import { Injectable } from '@nestjs/common';
import { GameSession, PlayerColor } from './game.interfaces';
import { CusromLoggerService } from 'src/common/logger/logger.service';

type TickCallback = (game: GameSession) => void;
type ExpireCallback = (expiredColor: PlayerColor, game: GameSession) => void;

@Injectable()
export class GameStateService {
  // ✅ key = JAVA gameId (uuid)
  private games = new Map<string, GameSession>();

  // socketId -> JAVA gameId
  private socketToGame = new Map<string, string>();

  // roomId (lobby code) -> JAVA gameId
  private roomToGame = new Map<string, string>();

  // JAVA gameId -> interval handle
  private timers = new Map<string, NodeJS.Timeout>();

  constructor(private readonly logger: CusromLoggerService) {}

  // ---------------------------
  // RESOLVE roomId -> gameId
  // ---------------------------
  private resolveGameId(idOrRoomId: string): string | null {
    if (!idOrRoomId) {
      this.logger.warn(`[RESOLVE] empty idOrRoomId`);
      return null;
    }

    const direct = this.games.has(idOrRoomId);
    const mapped = this.roomToGame.get(idOrRoomId);
    const mappedExists = mapped ? this.games.has(mapped) : false;

    this.logger.log(
      `[RESOLVE] input=${idOrRoomId} direct=${direct} mapped=${mapped ?? 'null'} mappedExists=${mappedExists}`,
    );

    if (direct) return idOrRoomId;
    if (mapped && this.games.has(mapped)) return mapped;

    return null;
  }

  mapRoomToGame(roomId: string, gameId: string) {
    const prev = this.roomToGame.get(roomId);
    if (prev && prev !== gameId) {
      this.logger.warn(
        `[MAP] overwriting mapping roomId=${roomId} prev=${prev} new=${gameId}`,
      );
    }
    this.roomToGame.set(roomId, gameId);
    this.logger.log(`[MAP] roomId=${roomId} -> gameId=${gameId}`);
  }

  // ---------------------------
  // CREATE / GET
  // ---------------------------
  createGame({
    player1Name,
    player2Name,
    gameId,
    fen,
    legalMoves,
  }: {
    legalMoves: string[];
    gameId: string;
    player1Name: string;
    player2Name: string;
    fen: string;
  }) {
    // randomize colors
    if (Math.random() > 0.5) {
      const temp = player1Name;
      player1Name = player2Name;
      player2Name = temp;
    }

    const session: GameSession = {
      gameId,
      whitePlayer: {
        name: player1Name,
        socketId: null,
        isCurrent: true,
        timeRemaining: 300,
      },
      blackPlayer: {
        name: player2Name,
        socketId: null,
        isCurrent: false,
        timeRemaining: 300,
      },
      fen,
      legalMoves,
      drawOfferFrom: null,
      gameStatus: 'playing',
    };

    this.games.set(gameId, session);
    this.logger.log(
      `[CREATE] stored game javaGameId=${gameId} white=${session.whitePlayer.name} black=${session.blackPlayer.name}`,
    );

    return session;
  }

  getGame(idOrRoomId: string): GameSession | undefined {
    const gid = this.resolveGameId(idOrRoomId);
    if (!gid) {
      this.logger.warn(`[GET_GAME] not found for=${idOrRoomId}`);
      return undefined;
    }

    const g = this.games.get(gid);
    this.logger.log(`[GET_GAME] input=${idOrRoomId} -> gid=${gid} found=${!!g}`);
    return g;
  }

  // ---------------------------
  // PLAYER REG / TURN
  // ---------------------------
  registerPlayerSocket(
    idOrRoomId: string,
    playerName: string,
    socketId: string,
  ): PlayerColor | null {
    this.logger.log(
      `[REG] start input=${idOrRoomId} playerName=${playerName} socketId=${socketId}`,
    );

    const gid = this.resolveGameId(idOrRoomId);
    this.logger.log(`[REG] resolved gid=${gid}`);

    if (!gid) return null;

    const game = this.games.get(gid);
    if (!game) return null;

    this.logger.log(
      `[REG] game players: white=${game.whitePlayer.name} black=${game.blackPlayer.name}`,
    );

    if (game.whitePlayer.name === playerName) {
      game.whitePlayer.socketId = socketId;
      this.socketToGame.set(socketId, gid);
      this.logger.log(`[REG] set WHITE socketId=${socketId}`);
      return 'white';
    }

    if (game.blackPlayer.name === playerName) {
      game.blackPlayer.socketId = socketId;
      this.socketToGame.set(socketId, gid);
      this.logger.log(`[REG] set BLACK socketId=${socketId}`);
      return 'black';
    }

    this.logger.warn(`[REG] name mismatch: ${playerName} not in game gid=${gid}`);
    return null;
  }

 isPlayerTurn(idOrRoomId: string, socketId: string): boolean {
  const gid = this.resolveGameId(idOrRoomId);
  if (!gid) return false;

  const game = this.games.get(gid);
  if (!game) return false;

  // ✅ ГОЛОВНЕ: після кінця гри — завжди false
  if (game.gameStatus && game.gameStatus !== 'playing') return false;

  if (game.whitePlayer.socketId === socketId && game.whitePlayer.isCurrent) return true;
  if (game.blackPlayer.socketId === socketId && game.blackPlayer.isCurrent) return true;

  return false;
}

  // ---------------------------
  // GAME STATE UPDATE (after move)
  // ---------------------------
  updateGameState(idOrRoomId: string, newFen: string, newLegalMoves: string[]) {
    const gid = this.resolveGameId(idOrRoomId);
    if (!gid) return undefined;

    const game = this.games.get(gid);
    if (!game) return undefined;

    game.fen = newFen;
    game.legalMoves = newLegalMoves;

    // switch turn
    game.whitePlayer.isCurrent = !game.whitePlayer.isCurrent;
    game.blackPlayer.isCurrent = !game.blackPlayer.isCurrent;

    // clear draw offer on any move
    game.drawOfferFrom = null;

    this.logger.log(`[UPDATE] roomOrId=${idOrRoomId} gid=${gid} turnSwitched`);

    return game;
  }

  // ---------------------------
  // CLOCK
  // ---------------------------
  startClock(idOrRoomId: string, tickCb: TickCallback, onExpire?: ExpireCallback) {
    const gid = this.resolveGameId(idOrRoomId);
    if (!gid) return;

    const game = this.games.get(gid);
    if (!game) return;

    if (game.gameStatus && game.gameStatus !== 'playing') return;

    // prevent multiple timers
    this.stopClock(gid);

    this.logger.log(`[CLOCK] start gid=${gid} (input=${idOrRoomId})`);

    const tick = () => {
      const currentColor: PlayerColor = game.whitePlayer.isCurrent ? 'white' : 'black';
      const player = currentColor === 'white' ? game.whitePlayer : game.blackPlayer;

      if (typeof player.timeRemaining !== 'number') player.timeRemaining = 300;
      player.timeRemaining = Math.max(0, player.timeRemaining - 1);

      tickCb(game);

      if (player.timeRemaining <= 0) {
        this.logger.warn(`[CLOCK] expired gid=${gid} expiredColor=${currentColor}`);
        this.stopClock(gid);
        if (onExpire) onExpire(currentColor, game);
      }
    };

    // immediate tick for UI sync
    tickCb(game);

    const handle = setInterval(tick, 1000);
    this.timers.set(gid, handle);
  }

  stopClock(idOrRoomId: string) {
    const gid = this.resolveGameId(idOrRoomId) ?? idOrRoomId;
    const t = this.timers.get(gid);
    if (t) {
      clearInterval(t);
      this.timers.delete(gid);
      this.logger.log(`[CLOCK] stop gid=${gid}`);
    }
  }

  // ---------------------------
  // DRAW
  // ---------------------------
  offerDraw(idOrRoomId: string, offeringSocketId: string) {
    const gid = this.resolveGameId(idOrRoomId);
    if (!gid) return null;

    const game = this.games.get(gid);
    if (!game || game.gameStatus !== 'playing') return null;

    const color: PlayerColor | null =
      game.whitePlayer.socketId === offeringSocketId
        ? 'white'
        : game.blackPlayer.socketId === offeringSocketId
          ? 'black'
          : null;

    if (!color) return null;

    game.drawOfferFrom = color;
    this.logger.log(`[DRAW] offer gid=${gid} from=${color}`);

    return game;
  }

  acceptDraw(idOrRoomId: string, acceptingSocketId: string) {
    const gid = this.resolveGameId(idOrRoomId);
    if (!gid) return null;

    const game = this.games.get(gid);
    if (!game || game.gameStatus !== 'playing') return null;
    if (!game.drawOfferFrom) return null;

    const acceptingColor: PlayerColor | null =
      game.whitePlayer.socketId === acceptingSocketId
        ? 'white'
        : game.blackPlayer.socketId === acceptingSocketId
          ? 'black'
          : null;

    if (!acceptingColor) return null;
    if (acceptingColor === game.drawOfferFrom) return null;

    game.gameStatus = 'draw';
    game.drawOfferFrom = null;
    this.stopClock(gid);

    this.logger.log(`[DRAW] accepted gid=${gid} -> draw`);

    return game;
  }

  // ---------------------------
  // RESIGN
  // ---------------------------
  resign(idOrRoomId: string, resigningSocketId: string) {
    const gid = this.resolveGameId(idOrRoomId);
    if (!gid) return null;

    const game = this.games.get(gid);
    if (!game || game.gameStatus !== 'playing') return null;

    const resigningColor: PlayerColor | null =
      game.whitePlayer.socketId === resigningSocketId
        ? 'white'
        : game.blackPlayer.socketId === resigningSocketId
          ? 'black'
          : null;

    if (!resigningColor) return null;

    const winner =
      resigningColor === 'white' ? game.blackPlayer.name : game.whitePlayer.name;
    const loser =
      resigningColor === 'white' ? game.whitePlayer.name : game.blackPlayer.name;

    game.gameStatus = resigningColor === 'white' ? 'blackWon' : 'whiteWon';
    game.drawOfferFrom = null;

    this.stopClock(gid);

    this.logger.warn(`[RESIGN] gid=${gid} resignColor=${resigningColor} winner=${winner} loser=${loser}`);

    return { game, winner, loser };
  }

  // ---------------------------
  // END / DISCONNECT
  // ---------------------------
  endGame(idOrRoomId: string) {
    const gid = this.resolveGameId(idOrRoomId) ?? idOrRoomId;

    this.logger.warn(`[END] gid=${gid} input=${idOrRoomId}`);

    this.stopClock(gid);

    const game = this.games.get(gid);
    if (game) {
      if (game.whitePlayer.socketId) this.socketToGame.delete(game.whitePlayer.socketId);
      if (game.blackPlayer.socketId) this.socketToGame.delete(game.blackPlayer.socketId);
    }

    this.games.delete(gid);
  }

  handleDisconnect(socketId: string): string | null {
    const gid = this.socketToGame.get(socketId);
    if (!gid) return null;

    const game = this.games.get(gid);
    if (game) {
      if (game.whitePlayer.socketId === socketId) game.whitePlayer.socketId = null;
      if (game.blackPlayer.socketId === socketId) game.blackPlayer.socketId = null;
    }

    this.socketToGame.delete(socketId);
    this.logger.warn(`[DISCONNECT] socket=${socketId} gid=${gid}`);

    return gid;
  }
}
