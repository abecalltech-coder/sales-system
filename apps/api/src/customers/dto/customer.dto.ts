import { IsEmail, IsInt, IsOptional, IsString } from 'class-validator';

export class CreateCustomerDto {
  @IsOptional() @IsString() corporateName?: string;
  @IsOptional() @IsString() contactName?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() postalCode?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() building?: string;
  @IsOptional() @IsString() memo?: string;
}

export class UpdateCustomerDto extends CreateCustomerDto {
  @IsInt()
  version!: number;
}
