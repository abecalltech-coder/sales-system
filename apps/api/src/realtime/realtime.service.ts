import { Injectable } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';

export interface CaseUpdatedEvent {
  entityType: 'TOSS_CASE' | 'APPOINTMENT' | 'VISIT' | 'CONTRACT' | 'ENTRY' | 'CUSTOMER';
  id: string;
  version: number;
  updatedAt: string;
  updatedBy?: string;
  changedFields?: string[];
  action: 'created' | 'updated' | 'deleted';
}

/**
 * 案件全体ではなく必要最小限の差分情報のみを配信する(セクション32)。
 * ルームは動的に指定でき、company/department/team/userの複数へ同時配信する用途にも対応する。
 */
@Injectable()
export class RealtimeService {
  constructor(private readonly gateway: RealtimeGateway) {}

  emitCaseUpdated(rooms: string[], event: CaseUpdatedEvent) {
    for (const room of rooms) {
      this.gateway.server.to(room).emit('case.updated', event);
    }
  }

  emitToUser(userId: string, eventName: string, payload: unknown) {
    this.gateway.server.to(`user:${userId}`).emit(eventName, payload);
  }

  emitPresence(entityType: string, entityId: string, users: { id: string; name: string }[]) {
    this.gateway.server.to(`${entityType}:${entityId}`).emit('presence.updated', { entityType, entityId, users });
  }
}
