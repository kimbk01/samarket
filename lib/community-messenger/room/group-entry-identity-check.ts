import {
  claimCmRoomEntryIdentityCheck,
  getCmRoomEntryStartedAt,
  hasCmRoomNetworkBootstrapSucceededSince,
} from "@/lib/community-messenger/room/cm-room-bootstrap-lock";
import {
  isCommunityMessengerGroupRoomType,
  type CommunityMessengerRoomSnapshot,
} from "@/lib/community-messenger/types";
import { isDevSafeMode } from "@/lib/dev/is-dev-safe-mode";

export const GROUP_ENTRY_IDENTITY_TRIGGER = "entry_group_identity";

type RefreshFn = (
  silent?: boolean,
  opts?: { forceSilentNetwork?: boolean; triggerReason?: string }
) => Promise<void>;

/**
 * 재감사 R2 (docs/design/group-chat-reaudit-2026-11-13.md §6 R2 · 결함 D3):
 * 그룹 방 진입이 **네트워크 요청 없이 캐시로 끝나는 지점**에서만 부른다 — 진입 후 방 사진·제목을 1회 다시 받는다.
 * - 대상은 그룹 방만: 1:1 진입은 이미 `silent_delta` 를 1회 받는다(운영 실측 2026-11-13 Xiaomi 5회×2방).
 * - 시간값 없이 첫 화면이 그려진 뒤(rAF 2회 — 기존 보강 GET 예약과 같은 기준) 요청한다.
 * - 진입당 1회(`claimCmRoomEntryIdentityCheck`). 그 사이 네트워크로 방 정보를 받았으면 보내지 않는다.
 */
export function requestGroupEntryIdentityAfterFirstPaint(args: {
  roomId: string;
  snapshot: Pick<CommunityMessengerRoomSnapshot, "room"> | null | undefined;
  refresh: RefreshFn;
}): void {
  if (typeof window === "undefined" || isDevSafeMode()) return;
  const roomType = args.snapshot?.room?.roomType;
  if (!roomType || !isCommunityMessengerGroupRoomType(roomType)) return;
  if (!claimCmRoomEntryIdentityCheck(args.roomId)) return;
  const enteredAt = getCmRoomEntryStartedAt(args.roomId);
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      if (hasCmRoomNetworkBootstrapSucceededSince(args.roomId, enteredAt)) return;
      void args.refresh(true, { triggerReason: GROUP_ENTRY_IDENTITY_TRIGGER, forceSilentNetwork: true });
    });
  });
}
