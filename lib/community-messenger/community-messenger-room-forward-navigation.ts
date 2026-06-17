import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import {
  communityMessengerRoomHref,
  resolveDeliveryMessengerRoomReturnHref,
  type MessengerRoomListSource,
} from "@/lib/community-messenger/messenger-entry-origin";
import { runMessengerViewTransition } from "@/lib/community-messenger/messenger-view-transition";
import {
  isRoomSnapshotFresh,
  prefetchCommunityMessengerRoomSnapshot,
} from "@/lib/community-messenger/room-snapshot-cache";
import { primeMessengerRoomEntrySnapshot } from "@/lib/community-messenger/stores/messenger-realtime-store";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";
import { noteR2M9Stage, resetR2M9ProfileSession } from "@/lib/community-messenger/room/cm-room-r2-m9-entry-profile";
import {
  beginR2M10ListTap,
  messengerRoomNavPrefetchTapState,
  noteR2M10ClickHandlerDone,
  noteR2M10ClickHandlerStart,
  noteR2M10RouterPushDone,
  noteR2M10RouterPushStart,
} from "@/lib/community-messenger/room/cm-room-r2-m10-route-transition";
import { beginRouteEntryPerf, recordRouteEntryMetric } from "@/lib/runtime/samarket-runtime-debug";
import { markCmRoomEntryForwardNavigation } from "@/lib/community-messenger/room/cm-room-entry-instrumentation";
import { noteCmRoomRouteTransitionStart } from "@/lib/community-messenger/dev/cm-dev-noise-impact";
import { beginCmRoomEntryPriorityMode } from "@/lib/community-messenger/room/cm-room-entry-priority-mode";
import {
  beginCmPreRouteRoomOpeningOverlay,
  scheduleCmPreRouteRoomNavigationFollowUp,
} from "@/lib/community-messenger/room/begin-cm-pre-route-room-opening";
import { noteR2M11DRouterPrefetchCalled } from "@/lib/community-messenger/room/cm-room-r2-m11d-prefetch-flight";

/** 클릭~라우팅 사이 스냅샷 GET 상한 — 포인터다운 프리패치가 거의 끝난 경우 짧게 합류(무한 대기 금지) */
const ROOM_NAV_SNAPSHOT_LEAD_MS_MIN = 0;
const ROOM_NAV_SNAPSHOT_LEAD_MS_MAX = 112;

function messengerRoomNavSnapshotLeadMs(): number {
  return (
    ROOM_NAV_SNAPSHOT_LEAD_MS_MIN +
    Math.floor(Math.random() * (ROOM_NAV_SNAPSHOT_LEAD_MS_MAX - ROOM_NAV_SNAPSHOT_LEAD_MS_MIN + 1))
  );
}

export type CommunityMessengerRoomForwardNavArgs = {
  router: AppRouterInstance;
  roomId: string;
  listSource: MessengerRoomListSource;
  /** `?from=` 원시 값 — `communityMessengerRoomHref` 에서 파싱 */
  fromEntryOrigin: string | null | undefined;
  viewerUserId?: string | null;
  /** 목록 행 등 요약이 있으면 Realtime 시드에 반영 */
  roomForPrime?: CommunityMessengerRoomSummary | null;
};

/**
 * 인박스 / 거래 채팅 / 배달 채팅 목록 → 방 (R2-M10):
 * **router.push 먼저**(동기) → overlay·priority·prime 은 microtask 로 분리.
 * pointerdown 프리패치는 목록 행에서 유지.
 */
export async function runCommunityMessengerRoomForwardNavigation(
  args: CommunityMessengerRoomForwardNavArgs
): Promise<void> {
  const id = String(args.roomId ?? "").trim();
  if (!id) return;

  const returnHref =
    args.listSource === "delivery" && typeof window !== "undefined"
      ? resolveDeliveryMessengerRoomReturnHref({
          pathname: window.location.pathname,
          search: window.location.search,
          fromEntryOrigin: args.fromEntryOrigin,
        })
      : null;
  const dest = communityMessengerRoomHref(id, args.fromEntryOrigin, args.listSource, returnHref);
  const vu = args.viewerUserId?.trim() || null;
  const room = args.roomForPrime ?? null;

  beginR2M10ListTap(id, vu, dest);
  noteR2M10ClickHandlerStart(id);
  const prefetchAtTap = messengerRoomNavPrefetchTapState(id, vu, dest);

  resetR2M9ProfileSession();
  noteR2M9Stage("list_nav_begin");
  beginRouteEntryPerf("messenger_room_entry", dest);
  markCmRoomEntryForwardNavigation();

  noteR2M10ClickHandlerDone(id);
  noteR2M10RouterPushStart(id);
  noteR2M9Stage("route_push");
  recordRouteEntryMetric("messenger_room_entry", "router_push_called_ms", 0);
  runMessengerViewTransition(() => {
    args.router.push(dest);
  }, "room-forward");
  noteR2M10RouterPushDone(id);

  scheduleCmPreRouteRoomNavigationFollowUp(() => {
    noteCmRoomRouteTransitionStart();
    const snapshotFresh = isRoomSnapshotFresh(id, vu);
    if (!snapshotFresh) {
      beginCmPreRouteRoomOpeningOverlay(id);
    }
    beginCmRoomEntryPriorityMode(id);
    if (room && vu) {
      primeMessengerRoomEntrySnapshot({ viewerUserId: vu, room });
    }
  });

  void args.router.prefetch(dest);
  noteR2M11DRouterPrefetchCalled(id, dest);
  if (!prefetchAtTap.snapshot_fresh && !isRoomSnapshotFresh(id, vu)) {
    void prefetchCommunityMessengerRoomSnapshot(id).catch(() => false);
  }
}
