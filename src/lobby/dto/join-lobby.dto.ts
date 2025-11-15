import { IsNotEmpty, IsString, IsUppercase, Length } from 'class-validator';

export class JoinLobbyDto {
  @IsString()
  @IsNotEmpty()
  @IsUppercase()
  @Length(4, 4) // Based on your generateRoomId()
  roomId: string;

  @IsString()
  @IsNotEmpty()
  @Length(2, 20)
  name: string;
}
