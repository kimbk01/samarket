import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";
import type { CmRoomPhase2HydrationPass } from "@/lib/community-messenger/room/cm-room-phase2-hydration-context";

/**
 * hydration pass 진입 시 paintable 메시지 시드만 인정 — lastMessage only 금지.
 */
/**
 * paintable seed 가 있으면 pass2→3 idle 확장 없이 pass3 — 대량 call_stub·메시지 방 진입 깜빡임 방지.
 */
export function resolveMessengerRoomPhase2HydrationPassInitial(input: {
  persistedPass: number;
  hasTimelineSeed: boolean;
}): CmRoomPhase2HydrationPass {
  if (input.persistedPass >= 3) return 3;
  if (input.hasTimelineSeed) return 3;
  if (input.persistedPass >= 2) return 2;
  const clamped = Math.max(1, Math.min(3, input.persistedPass));
  return clamped as CmRoomPhase2HydrationPass;
}

export function hasMessengerRoomHydrationTimelineSeed(input: {
  roomMessagesLength: number;
  snapshotMessagesLength: number;
  snapshot?: Parameters<typeof isMessengerRoomTimelinePaintableBootstrapSeed>[0];
}): boolean {
  if (input.roomMessagesLength > 0) return true;
  if (input.snapshotMessagesLength > 0 && isMessengerRoomTimelinePaintableBootstrapSeed(input.snapshot)) {
    return true;
  }
  return false;
}

/** 타임라인에 메시지·lastMessage 힌트가 있는지 — 일반·거래·배달 공통 */
export function hasMessengerRoomTimelineLoadHint(input: {
  roomMessagesLength: number;
  snapshotMessagesLength: number;
  lastMessage?: string | null;
}): boolean {
  return (
    input.roomMessagesLength > 0 ||
    input.snapshotMessagesLength > 0 ||
    Boolean(input.lastMessage?.trim())
  );
}

/**
 * 입장 bootstrap·LRU 캐시 reuse 가능 여부 — `lastMessage` 힌트만 있고 `messages[]` 가 비면 불완전(목록 bump·summary patch 잔재).
 * 신규 빈 방(lastMessage 없음)은 true.
 */
export function isMessengerRoomTimelineBootstrapSeedComplete(
  snapshot:
    | {
        messages?: CommunityMessengerRoomSnapshot["messages"];
        room: Pick<CommunityMessengerRoomSnapshot["room"], "lastMessage">;
      }
    | null
    | undefined
): boolean {
  if (!snapshot) return false;
  const hasLastMessageHint = Boolean(snapshot.room.lastMessage?.trim());
  if (!hasLastMessageHint) return true;
  return (snapshot.messages?.length ?? 0) > 0;
}

/**
 * roomMessages merge 직전 snapshot read-only paint 허용 여부.
 * DO NOT: lastMessage only · messages[] 없음 · incomplete seed · partial stub.
 * 허용: messages[] 가 1건 이상이고 bootstrap seed complete.
 */
export function isMessengerRoomTimelinePaintableBootstrapSeed(
  snapshot:
    | {
        messages?: CommunityMessengerRoomSnapshot["messages"];
        room: Pick<CommunityMessengerRoomSnapshot["room"], "lastMessage">;
      }
    | null
    | undefined
): boolean {
  if (!snapshot) return false;
  const messageCount = snapshot.messages?.length ?? 0;
  if (messageCount <= 0) return false;
  return isMessengerRoomTimelineBootstrapSeedComplete(snapshot);
}

/**
 * 메신저 방 타임라인 중앙 버퍼링 스피너 표시 여부.
 * 신규·빈 방(`clientShellPlaceholder`, 힌트 없음)은 스피너 없이 빈 타임라인을 먼저 보여준다.
 */
export function shouldShowMessengerRoomTimelineHydrationSkeleton(input: {
  displayRoomMessagesLength: number;
  roomMessagesLength: number;
  hydrationPass: number;
  clientShellPlaceholder: boolean;
  loading: boolean;
  snapshotMessagesLength: number;
  lastMessage?: string | null;
}): boolean {
  if (input.displayRoomMessagesLength > 0) return false;
  if (input.roomMessagesLength > 0 && input.hydrationPass >= 2) return false;

  const hasTimelineLoadHint = hasMessengerRoomTimelineLoadHint({
    roomMessagesLength: input.roomMessagesLength,
    snapshotMessagesLength: input.snapshotMessagesLength,
    lastMessage: input.lastMessage,
  });

  if (input.clientShellPlaceholder) {
    return hasTimelineLoadHint;
  }

  return (
    hasTimelineLoadHint &&
    (input.loading || input.hydrationPass < 2)
  );
}
