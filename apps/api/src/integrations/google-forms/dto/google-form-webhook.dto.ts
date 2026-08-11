import { IsObject, IsOptional, IsString } from 'class-validator';

export class GoogleFormWebhookDto {
  @IsOptional() @IsString() responseId?: string; // Googleフォーム回答ID(冪等性チェックに使用)
  @IsOptional() @IsString() submittedAt?: string;
  @IsObject() answers!: Record<string, string>; // { 質問タイトル: 回答文字列 }
}

export class SetGoogleFormUrlDto {
  @IsString() formUrl!: string;
}
