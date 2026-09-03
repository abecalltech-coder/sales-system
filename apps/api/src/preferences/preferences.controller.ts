import { BadRequestException, Body, Controller, Get, Param, Put } from '@nestjs/common';
import { Allow } from 'class-validator';
import { PreferencesService } from './preferences.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types';

// 設定キーは "英数・_-・:" のみ、64文字まで。想定: "tableWidths:toss-cases"
const KEY_PATTERN = /^[A-Za-z0-9_:-]{1,64}$/;

class SetPreferenceDto {
  @Allow()
  value!: unknown;
}

/**
 * ログインユーザー本人のUI設定(一覧の列幅など)。権限デコレータは付けないため、
 * 認証さえ通っていれば誰でも「自分の」設定だけ読み書きできる(userIdはJWTから取得)。
 */
@Controller('me/preferences')
export class PreferencesController {
  constructor(private readonly service: PreferencesService) {}

  @Get(':key')
  async get(@CurrentUser() user: AuthenticatedUser, @Param('key') key: string) {
    this.assertKey(key);
    return { key, value: await this.service.get(user.id, key) };
  }

  @Put(':key')
  async set(@CurrentUser() user: AuthenticatedUser, @Param('key') key: string, @Body() dto: SetPreferenceDto) {
    this.assertKey(key);
    return { key, value: await this.service.set(user.id, key, dto.value) };
  }

  private assertKey(key: string) {
    if (!KEY_PATTERN.test(key)) throw new BadRequestException('設定キーの形式が不正です');
  }
}
