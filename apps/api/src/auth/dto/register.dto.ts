import { IsEmail, IsOptional, IsString, Matches, MinLength } from 'class-validator';

// 8文字以上、英大文字/英小文字/数字を含む(セクション40のパスワードポリシー、ChangePasswordDtoと同一基準)
export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8, { message: 'パスワードは8文字以上で入力してください' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, {
    message: 'パスワードは英大文字・英小文字・数字を含めてください',
  })
  password!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  employeeCode?: string;
}
