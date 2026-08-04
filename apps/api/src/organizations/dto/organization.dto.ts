import { IsBoolean, IsInt, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateDepartmentDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsInt()
  order?: number;
}

export class UpdateDepartmentDto {
  @IsInt()
  version!: number;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsInt()
  order?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class CreateTeamDto {
  @IsUUID()
  departmentId!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsInt()
  order?: number;
}

export class UpdateTeamDto {
  @IsInt()
  version!: number;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsInt()
  order?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
