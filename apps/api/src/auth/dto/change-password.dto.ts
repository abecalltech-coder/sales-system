import { IsString, Matches, MinLength } from 'class-validator';

// 8文字以上、英大文字/英小文字/数字/記号のうち3種類以上を要求(セクション40のパスワードポリシー)
export class ChangePasswordDto {
  @IsString()
  currentPassword!: string;

  @IsString()
  @MinLength(8, { message: 'パスワードは8文字以上で入力してください' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, {
    message: 'パスワードは英大文字・英小文字・数字を含めてください',
  })
  newPassword!: string;
}
