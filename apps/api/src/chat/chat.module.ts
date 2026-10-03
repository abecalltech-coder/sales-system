import { Body, Controller, Delete, Get, Module, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types';
import { PushNotificationsModule } from '../push-notifications/push-notifications.module';
import { ChatService } from './chat.service';
import { CreateRoomDto, ForwardDto, SendMessageDto, UpdateProfileDto, UpdateRoomDto } from './chat.dto';

/** チャット。権限デコレータ無し=ログインユーザーなら利用可(各操作でルームのメンバーかを確認する) */
@Controller('chat')
class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get('rooms')
  rooms(@CurrentUser() user: AuthenticatedUser) {
    return this.chat.listRooms(user.id);
  }

  @Get('unread')
  unread(@CurrentUser() user: AuthenticatedUser) {
    return this.chat.unreadTotal(user.id);
  }

  @Post('rooms')
  createRoom(@Body() dto: CreateRoomDto, @CurrentUser() user: AuthenticatedUser) {
    return this.chat.createRoom(dto, user.id);
  }

  @Get('rooms/:id')
  room(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.chat.getRoom(id, user.id);
  }

  @Patch('rooms/:id')
  updateRoom(@Param('id') id: string, @Body() dto: UpdateRoomDto, @CurrentUser() user: AuthenticatedUser) {
    return this.chat.updateRoom(id, dto, user.id);
  }

  @Post('rooms/:id/leave')
  leave(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.chat.leaveRoom(id, user.id);
  }

  @Get('rooms/:id/messages')
  messages(@Param('id') id: string, @Query('before') before: string | undefined, @CurrentUser() user: AuthenticatedUser) {
    return this.chat.listMessages(id, user.id, before);
  }

  @Post('rooms/:id/messages')
  send(@Param('id') id: string, @Body() dto: SendMessageDto, @CurrentUser() user: AuthenticatedUser) {
    return this.chat.send(id, dto, user.id);
  }

  @Post('rooms/:id/read')
  read(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.chat.markRead(id, user.id);
  }

  @Get('messages/:id/readers')
  readers(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.chat.readers(id, user.id);
  }

  @Delete('messages/:id')
  unsend(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.chat.unsend(id, user.id);
  }

  @Post('forward')
  forward(@Body() dto: ForwardDto, @CurrentUser() user: AuthenticatedUser) {
    return this.chat.forward(dto, user.id);
  }
}

/** アカウント設定(写真)。本人のみ */
@Controller('me/profile')
class ProfileController {
  constructor(private readonly chat: ChatService) {}

  @Get()
  get(@CurrentUser() user: AuthenticatedUser) {
    return this.chat.profile(user.id);
  }

  @Put()
  update(@Body() dto: UpdateProfileDto, @CurrentUser() user: AuthenticatedUser) {
    return this.chat.updateProfile(user.id, dto.iconUrl);
  }
}

@Module({
  imports: [PushNotificationsModule],
  providers: [ChatService],
  controllers: [ChatController, ProfileController],
})
export class ChatModule {}
