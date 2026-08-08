import { IsArray, IsOptional, IsString, IsUUID } from 'class-validator';

export class ApproveUserDto {
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsUUID()
  teamId?: string;

  @IsArray()
  @IsString({ each: true })
  roleCodes!: string[];
}
