import { IsInt, IsString, Min } from 'class-validator';

export class CreateSheetDto {
  @IsString()
  name!: string;
}

export class RenameSheetDto {
  @IsString()
  name!: string;
}

export class UpsertCellDto {
  @IsInt()
  @Min(0)
  row!: number;

  @IsInt()
  @Min(0)
  col!: number;

  @IsString()
  value!: string;
}
