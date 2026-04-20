import type { LoadChatRoomDetailDiagnostics } from "@/lib/chats/server/load-chat-room-detail";
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
  /**
   * 비프로덕션 전용 — Playwright 가 `samarket_e2e_room_diag=1` 쿠키를 심을 때 방 페이지가 true 로 전달.
   * `MESSENGER_PERF_TRACE_ROOM_SNAPSHOT` 없이도 `chatRoomDetailLoad`·`#samarket-room-snapshot-diag` 활성화.
   */
  e2eRoomSnapshotDiag?: boolean;
};

export type CommunityMessengerRoomSnapshotDiagnostics = {
  roomBootstrapFetchMs?: number;
  messagesFetchMs?: number;
  participantsProfilesFetchMs?: number;
  normalizeMergeMs?: number;
  /** `loadCommunityMessengerRoomSnapshotUncached` 진입(`t0`) 기준 누적 ms — 단계 간격은 인접 키 차이 */
  snapshotEntryMs?: number;
  snapshotQueryAParallelEndMs?: number;
  snapshotQueryBProfilesEndMs?: number;
  snapshotNormalizeStartMs?: number;
  snapshotNormalizeDoneMs?: number;
  snapshotPreReturnMs?: number;
  /** `snapshotNormalizeStartMs` 직후 — `buildRoomSummaryFromHydratedMembers` 종료 (`tBootstrap0` 기준 ms) */
  normalizeTimelineSummaryEndMs?: number;
  /** `enrichTradeRoomContextMetaForBootstrap` + (가능 시) `enrichMessengerTradeUnreadWithLegacyTrade` 종료 */
  normalizeTimelineEnrichPathEndMs?: number;
  /** `tradeChatRoomDetailPromiseFromMessengerRoomRow` settle */
  normalizeTimelineTradeDetailEndMs?: number;
  /** `getActiveCallSessionForRoom` settle */
  normalizeTimelineActiveCallEndMs?: number;
  /** `fetchPresenceSnapshotsByUserIds` settle (빈 id면 즉시 resolve) */
  normalizeTimelinePresenceEndMs?: number;
  /** `Promise.all([enrich, Promise.all([call, trade, presence])])` 종료 */
  normalizeTimelineParallelOuterEndMs?: number;
  /** `members` 배열 `.map` 직후 */
  normalizeTimelineMembersMapEndMs?: number;
  /** `messages.map` 직후 (= `snapshotNormalizeDoneMs` 와 동일 시점) */
  normalizeTimelineMessageMapEndMs?: number;
  /** `normalizeTimelineSummaryEndMs` 기준 병렬 구간에서 가장 늦게 끝난 하위 단계 식별용 */
  normalizeSlowestNormalizeSubstepName?: string;
  normalizeSlowestNormalizeSubstepFromSummaryMs?: number;
  /** 병렬 3분기 + 요약 이후 구간용 — `snapshotNormalizeStartMs` 기준 누적 차이(ms), 음수 가능(선행 완료) */
  normalizeGapNsToTradeMs?: number;
  normalizeGapTradeToCallMs?: number;
  normalizeGapCallToPresenceMs?: number;
  normalizeGapPresenceToMessageMapMs?: number;
  normalizeGapMessageMapToNormalizeDoneMs?: number;
  /** `MESSENGER_PERF_TRACE_ROOM_SNAPSHOT=1` + 스냅샷 diagnostics 전달 시 `loadChatRoomDetailForUser(entry)` 내부 단계 */
  chatRoomDetailLoad?: LoadChatRoomDetailDiagnostics;
  /**
   * E2E trade 진단 오버레이(API)가 거래 방이 아니라 판단해 스킵했을 때 true.
   * Playwright 는 `fetchPostRelationAdoptedFrom` 없이도 진단 준비 완료로 볼 수 있다.
   */
  deferTradeDiagSkipped?: boolean;
  /**
   * defer 시드 `messages.map` 누적 ms(진단 전용). 키는 `loadCommunityMessengerRoomSnapshotUncached` 내 식별자와 동일.
   */
  mappedMessagesNormalizeSubstepsMs?: Record<string, number>;
  /** `mappedMessagesNormalizeSubstepsMs` 중 누적이 가장 큰 하위 단계 */
  mappedMessagesSlowestSubstepName?: string;
  mappedMessagesSlowestSubstepMs?: number;
};

export interface CommunityMessengerReadPort {
  getRoomSnapshot(
    userId: string,
    roomId: string,
    options?: CommunityMessengerRoomSnapshotOptions
  ): Promise<CommunityMessengerRoomSnapshot | null>;
}
