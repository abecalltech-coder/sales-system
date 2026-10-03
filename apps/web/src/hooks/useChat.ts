import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

export interface ChatRoomItem {
  id: string;
  name: string;
  photo: string | null;
  memberCount: number;
  lastMessageAt: string;
  lastMessage: { senderName: string; text: string; createdAt: string } | null;
  unread: number;
}

export interface ChatRoomDetail {
  id: string;
  name: string;
  photo: string | null;
  members: { id: string; name: string; iconUrl: string | null; lastReadAt: string }[];
}

export interface ForwardItem {
  senderName: string;
  body: string | null;
  image: string | null;
  createdAt: string;
}

export interface ChatMessageItem {
  id: string;
  senderId: string;
  senderName: string;
  senderIcon: string | null;
  body: string | null;
  image: string | null;
  forwardedFrom: string | null;
  forwardBundle: ForwardItem[] | null;
  unsent: boolean;
  createdAt: string;
  replyTo: { id: string; senderName: string; text: string } | null;
  readCount: number;
}

export function useChatRooms() {
  return useQuery({ queryKey: ['chat', 'rooms'], queryFn: () => api.get<ChatRoomItem[]>('/chat/rooms') });
}

export function useChatUnread() {
  return useQuery({ queryKey: ['chat', 'unread'], queryFn: () => api.get<{ total: number }>('/chat/unread'), refetchInterval: 60_000 });
}

export function useChatRoom(roomId: string | undefined) {
  return useQuery({
    queryKey: ['chat', 'room', roomId],
    queryFn: () => api.get<ChatRoomDetail>(`/chat/rooms/${roomId}`),
    enabled: !!roomId,
  });
}

export function useChatMessages(roomId: string | undefined) {
  return useQuery({
    queryKey: ['chat', 'messages', roomId],
    queryFn: () => api.get<{ hasMore: boolean; messages: ChatMessageItem[] }>(`/chat/rooms/${roomId}/messages`),
    enabled: !!roomId,
  });
}

export interface MyProfile {
  id: string;
  name: string;
  iconUrl: string | null;
}

export function useMyProfile() {
  return useQuery({ queryKey: ['me', 'profile'], queryFn: () => api.get<MyProfile>('/me/profile'), staleTime: 5 * 60_000 });
}
