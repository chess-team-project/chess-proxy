import {
  IsDefined,
  IsNotEmpty,
  IsString,
  Length,
  IsUppercase,
} from 'class-validator';

export class GameMoveDto {
  @IsString()
  @IsNotEmpty()
  @IsUppercase()
  @Length(4, 4)
  roomId: string;

  @IsString()
  @IsNotEmpty()
  @Length(2, 20)
  playerName: string;

  @IsDefined()
  @IsNotEmpty()
  move: any;
}
