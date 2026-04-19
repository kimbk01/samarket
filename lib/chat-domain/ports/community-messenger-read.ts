import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";

/**
 * 커뮤니티 메신저 — 방 스냅샷 조회 포트.
 * 구현체는 Supabase(`chat-infra-supabase`) 또는 향후 독립 chat-api 로 교체 가능.
 */
export type CommunityMessengerRoomSnapshotOptions = {
  initialMessageLimit?: number;
  /** 기본 true. false면 참가자 전원 프로필 생략(첫 페인트 가속) — `membersDeferred` 스냅샷 */
  hydrateFullMemberList?: boolean;
  /**
   * true면 방/참가자/메시지·필수 프로필 하이드레이션만 동기 완료하고
   * 통화·거래 도크·presence·방별 프로필 오버레이·trade 후처리는 생략(`bootstrapEnrichmentPending`).
   */
  deferSnapshotSecondary?: boolean;
  /** route 계측용 서버 분해 숫자 기록 */
  diagnostics?: CommunityMessengerRoomSnapshotDiagnostics;
};

export type CommunityMessengerRoomSnapshotDiagnostics = {
  roomBootstrapFetchMs?: number;
  messagesFetchMs?: number;
  participantsProfilesFetchMs?: number;
  normalizeMergeMs?: number;
};

export interface CommunityMessengerReadPort {
  getRoomSnapshot(
    userId: string,
    roomId: string,
    options?: CommunityMessengerRoomSnapshotOptions
  ): Promise<CommunityMessengerRoomSnapshot | null>;
}
