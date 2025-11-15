import { IsNotEmpty, IsString, Length } from 'class-validator';

export class CreateLobbyDto {
  @IsString()
  @IsNotEmpty()
  @Length(2, 20)
  name: string;
}
