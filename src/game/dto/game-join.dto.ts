import { IsNotEmpty, IsString, Length, IsUppercase } from 'class-validator';

export class GameJoinDto {
  @IsString()
  @IsNotEmpty()
  @IsUppercase()
  @Length(4, 4)
  roomId: string;

  @IsString()
  @IsNotEmpty()
  @Length(2, 20)
  playerName: string;
}
