import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import {
  communityMessengerRoomHref,
  type MessengerRoomListSource,
} from "@/lib/community-messenger/messenger-entry-origin";
import { runMessengerViewTransition } from "@/lib/community-messenger/messenger-view-transition";
import {
  isRoomSnapshotFresh,
  prefetchCommunityMessengerRoomSnapshot,
} from "@/lib/community-messenger/room-snapshot-cache";
import { primeMessengerRoomEntrySnapshot } from "@/lib/community-messenger/stores/messenger-realtime-store";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";
import { beginRouteEntryPerf, recordRouteEntryMetric } from "@/lib/runtime/samarket-runtime-debug";
import { markCmRoomEntryForwardNavigation } from "@/lib/community-messenger/room/cm-room-entry-instrumentation";
import { noteCmRoomRouteTransitionStart } from "@/lib/community-messenger/dev/cm-dev-noise-impact";
import { beginCmRoomEntryPriorityMode } from "@/lib/community-messenger/room/cm-room-entry-priority-mode";
import {
  beginCmPreRouteRoomOpeningOverlay,
  scheduleCmPreRouteRoomNavigation,
} from "@/lib/community-messenger/room/begin-cm-pre-route-room-opening";

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
 * 인박스 / 거래 채팅 / 배달 채팅 목록에서 방으로 들어갈 때 동일 조건:
 * 시드(prime) → perf 시작 → 스냅샷 프리패치(짧은 lead) → 라우트 prefetch → VT 래퍼 안 push
 */
export async function runCommunityMessengerRoomForwardNavigation(
  args: CommunityMessengerRoomForwardNavArgs
): Promise<void> {
  const id = String(args.roomId ?? "").trim();
  if (!id) return;

  const dest = communityMessengerRoomHref(id, args.fromEntryOrigin, args.listSource);
  const vu = args.viewerUserId?.trim() || null;
  const room = args.roomForPrime ?? null;

  beginCmPreRouteRoomOpeningOverlay(id);

  scheduleCmPreRouteRoomNavigation(() => {
    noteCmRoomRouteTransitionStart();
    beginCmRoomEntryPriorityMode(id);

    if (room && vu) {
      primeMessengerRoomEntrySnapshot({ viewerUserId: vu, room });
    }

    beginRouteEntryPerf("messenger_room_entry", dest);
    markCmRoomEntryForwardNavigation();

    recordRouteEntryMetric("messenger_room_entry", "router_push_called_ms", 0);
    runMessengerViewTransition(() => {
      args.router.push(dest);
    }, "room-forward");
  });

  void args.router.prefetch(dest);
  if (!isRoomSnapshotFresh(id, vu)) {
    void prefetchCommunityMessengerRoomSnapshot(id).catch(() => false);
  }
}
