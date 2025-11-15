// (e.g., src/game/dto/game-join.dto.ts)
import { IsNotEmpty, IsString, Length, IsUppercase } from 'class-validator';

export class GameJoinDto {
  @IsString()
  @IsNotEmpty()
  @IsUppercase()
  @Length(4, 4) // Assuming 4-char room ID based on lobby
  roomId: string;

  @IsString()
  @IsNotEmpty()
  @Length(2, 20) // Matching lobby name constraints
  playerName: string;
}
