/**
 * 그룹 채팅 부트스트랩 JSON 계약 — API·RSC·클라이언트 공통 (서버 전용 모듈 import 금지).
 */
export type GroupChatBootstrapApiBody = {
  ok: true;
  v: 1;
  domain: "group";
  room: {
    id: string;
    title: string;
    createdAt?: string;
    messageSeq: number;
    memberCount: number;
    lastMessageAt: string | null;
    lastMessagePreview: string | null;
    settings: unknown;
  };
  messages: Array<{
    id: string;
    roomId: string;
    senderId: string;
    messageType: string;
    body: string;
    metadata: unknown;
    createdAt: string;
    seq: number;
  }>;
  unread: { count: number; lastReadSeq: number };
  members: Array<{
    userId: string;
    role: string;
    joinedAt: string;
    nickname: string | null;
    username: string | null;
    avatarUrl: string | null;
  }>;
  memberCount: number;
  hasMoreMembers: boolean;
};

export type LoadGroupChatBootstrapResult =
  | { ok: true; body: GroupChatBootstrapApiBody }
  | { ok: false; status: number; error: string };
