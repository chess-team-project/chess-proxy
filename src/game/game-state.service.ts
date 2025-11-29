// game-state.service.ts
import { Injectable } from '@nestjs/common';
import { GameSession } from './game.interfaces';

@Injectable()
export class GameStateService {
  private games = new Map<string, GameSession>();
  private socketToGame = new Map<string, string>();

  createGame({ player1Name, player2Name, gameId, fen, legalMoves }: { legalMoves: string[], gameId: string, player1Name: string, player2Name: string, fen: string }) {
    if (Math.random() > 0.5) {
      const temp = player1Name;
      player1Name = player2Name;
      player2Name = temp;
    }
    const session: GameSession = {
      gameId,
      whitePlayer: { name: player1Name, socketId: null, isCurrent: true },
      blackPlayer: { name: player2Name, socketId: null, isCurrent: false },
      fen: fen,
      legalMoves,
    };

    this.games.set(gameId, session);
    return session;
  }

  getGame(gameId: string): GameSession | undefined {
    return this.games.get(gameId);
  }

  // Цей метод викликає GameGateway, коли юзер заходить
  registerPlayerSocket(gameId: string, playerName: string, socketId: string): 'white' | 'black' | null {
    const game = this.games.get(gameId);
    if (!game) return null;

    if (game.whitePlayer.name === playerName) {
      game.whitePlayer.socketId = socketId;
      this.socketToGame.set(socketId, gameId); // Запам'ятовуємо сокет
      return 'white';
    }

    if (game.blackPlayer.name === playerName) {
      game.blackPlayer.socketId = socketId;
      this.socketToGame.set(socketId, gameId);
      return 'black';
    }
    return null;
  }

  // Оновлюємо стан після ходу
  updateGameState(gameId: string, newFen: string, newLegalMoves: string[]) {
    const game = this.games.get(gameId);
    if (!game) return;

    game.fen = newFen;
    game.legalMoves = newLegalMoves;

    // Міняємо чергу ходу
    game.whitePlayer.isCurrent = !game.whitePlayer.isCurrent;
    game.blackPlayer.isCurrent = !game.blackPlayer.isCurrent;
  }

  // Допоміжний метод, щоб дізнатися, чия зараз черга (для валідації)
  isPlayerTurn(gameId: string, socketId: string): boolean {
    const game = this.games.get(gameId);
    if (!game) return false;

    if (game.whitePlayer.socketId === socketId && game.whitePlayer.isCurrent) return true;
    if (game.blackPlayer.socketId === socketId && game.blackPlayer.isCurrent) return true;

    return false;
  }

  handleDisconnect(socketId: string): string | null {
    const gameId = this.socketToGame.get(socketId);
    if (!gameId) return null;

    const game = this.games.get(gameId);
    if (game) {
      if (game.whitePlayer.socketId === socketId) game.whitePlayer.socketId = null;
      if (game.blackPlayer.socketId === socketId) game.blackPlayer.socketId = null;
    }

    this.socketToGame.delete(socketId);
    return gameId;
  }
}