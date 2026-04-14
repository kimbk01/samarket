import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";

/**
 * 커뮤니티 메신저 — 방 스냅샷 조회 포트.
 * 구현체는 Supabase(`chat-infra-supabase`) 또는 향후 독립 chat-api 로 교체 가능.
 */
export type CommunityMessengerRoomSnapshotOptions = {
  initialMessageLimit?: number;
  /** 기본 true. false면 참가자 전원 프로필 생략(첫 페인트 가속) — `membersDeferred` 스냅샷 */
  hydrateFullMemberList?: boolean;
};

export interface CommunityMessengerReadPort {
  getRoomSnapshot(
    userId: string,
    roomId: string,
    options?: CommunityMessengerRoomSnapshotOptions
  ): Promise<CommunityMessengerRoomSnapshot | null>;
}
