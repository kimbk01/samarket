import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import {
  communityMessengerRoomHref,
  resolveDeliveryMessengerRoomReturnHref,
  type MessengerRoomListSource,
} from "@/lib/community-messenger/messenger-entry-origin";
import { runMessengerViewTransition } from "@/lib/community-messenger/messenger-view-transition";
import { isMessengerSplitFrameDirectHeaderRoom } from "@/lib/community-messenger/room/messenger-split-room-entry-frame-seed";
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
import {
  beginCmRoomEntryPriorityMode,
  endCmRoomEntryPriorityMode,
} from "@/lib/community-messenger/room/cm-room-entry-priority-mode";
import { useCmRoomOpeningOverlayStore } from "@/lib/community-messenger/room/cm-room-opening-overlay-store";
import {
  beginCmPreRouteRoomOpeningOverlay,
  scheduleCmPreRouteRoomNavigationFollowUp,
} from "@/lib/community-messenger/room/begin-cm-pre-route-room-opening";
import { noteR2M11DRouterPrefetchCalled } from "@/lib/community-messenger/room/cm-room-r2-m11d-prefetch-flight";
import {
  beginRoomDeepRouteNavigationLock,
  clearDeepRouteNavigationLock,
} from "@/lib/navigation/cm-deep-route-navigation-lock";
import { clearPendingMenuNavigationBridge } from "@/lib/navigation/pending-menu-navigation-bridge";
import { guardedClientNavigate } from "@/lib/navigation/guarded-client-navigation";
import {
  beginMessengerRoomEntrySnapshot,
  dismissMessengerRoomEntrySnapshot,
} from "@/lib/community-messenger/room/messenger-page-snapshot-transition";
import { matchesMessengerSplitViewport } from "@/lib/ui/app-viewport-layout-breakpoints";
import {
  clearRoomEntryIntent,
  isRoomEntryInFlight,
  markRoomEntryIntent,
} from "@/lib/community-messenger/room/messenger-room-entry-intent";

export type CommunityMessengerRoomForwardNavArgs = {
  router: AppRouterInstance;
  roomId: string;
  listSource: MessengerRoomListSource;
  /** `?from=` 원시 값 — `communityMessengerRoomHref` 에서 파싱 */
  fromEntryOrigin: string | null | undefined;
  viewerUserId?: string | null;
  /** 목록 행 등 요약이 있으면 Realtime 시드에 반영 */
  roomForPrime?: CommunityMessengerRoomSummary | null;
  /** Global Search `/search?q=` restore. Existing `cm_return` sanitizer only. */
  returnHrefOverride?: string | null;
};

function currentPathname(): string {
  if (typeof window === "undefined") return "";
  return window.location.pathname || "";
}

function isCommunityMessengerRoomPathname(pathname: string): boolean {
  return /^\/community-messenger\/rooms\/[^/]+\/?$/.test(pathname);
}

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

  const overrideReturn = args.returnHrefOverride?.trim() || null;
  const returnHref =
    overrideReturn ??
    (args.listSource === "delivery" && typeof window !== "undefined"
      ? resolveDeliveryMessengerRoomReturnHref({
          pathname: window.location.pathname,
          search: window.location.search,
          fromEntryOrigin: args.fromEntryOrigin,
        })
      : null);
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
  clearPendingMenuNavigationBridge();
  beginRoomDeepRouteNavigationLock(id, dest);
  markRoomEntryIntent(
    id,
    room
      ? {
          title: room.title,
          avatarUrl: room.avatarUrl,
          ...(room.chatDomain ? { expectedDomain: room.chatDomain } : null),
          ...((room.domainIdentityKey ?? room.domainIdentity)?.trim()
            ? { expectedIdentityKey: (room.domainIdentityKey ?? room.domainIdentity)!.trim() }
            : null),
          ...(isMessengerSplitFrameDirectHeaderRoom(room, args.listSource)
            ? { splitFrameHeader: "direct" as const }
            : null),
        }
      : undefined
  );
  /**
   * 모바일: 이동 직전 현재 화면(목록) 복사본을 고정 — 라우트가 바뀌는 동안 흰 화면 대신 목록이 보이고,
   * 방이 마운트되면 방이 그 위로 밀고 들어온다(`MessengerRoomSwipeBackShell`). 분할 화면은 대상 아님.
   */
  const splitViewport = matchesMessengerSplitViewport();
  const entrySnapshot = !splitViewport;
  if (entrySnapshot) beginMessengerRoomEntrySnapshot();
  /**
   * ≥768 분할에서 방 → 다른 방 = 목록이 그대로인 같은 층 이동 → replace (cm-kakao 계약 「같은 층 replace」).
   * 기록이 [허브, 방] 으로 유지되어 헤더 ← (history back) 와 Android 시스템 뒤로가 같은 목록으로 간다 (BK-06).
   * 허브 → 첫 방, 모바일은 기존대로 push.
   */
  const sameLayerRoomSwitch = splitViewport && isCommunityMessengerRoomPathname(currentPathname());
  const navigate = sameLayerRoomSwitch
    ? args.router.replace.bind(args.router)
    : args.router.push.bind(args.router);
  runMessengerViewTransition(() => {
    const allowed = guardedClientNavigate(navigate, dest, "room_forward");
    if (!allowed && entrySnapshot) dismissMessengerRoomEntrySnapshot();
    if (allowed) armRoomEntryAbortOnBack(id);
  }, "room-forward");
  noteR2M10RouterPushDone(id);

  scheduleCmPreRouteRoomNavigationFollowUp(() => {
    noteCmRoomRouteTransitionStart();
    const snapshotFresh = isRoomSnapshotFresh(id, vu);
    if (!snapshotFresh || isRoomEntryInFlight(id)) {
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


// ─── 방 진입 중 뒤로 = 진입 중단 (2026-11-15 Owner 「남은 부분 없도록」) ─────────────────────────────

/** 방 진입 직후 뒤로를 받는 시간 — 진입 잠금(2.5초)·목록 사진 상한(3초)보다 길게 */
const ROOM_ENTRY_ABORT_WATCH_MS = 5_000;

let roomEntryAbortWatch: { roomId: string; onPop: () => void; timer: ReturnType<typeof setTimeout> } | null = null;

function disarmRoomEntryAbortOnBack(): void {
  const w = roomEntryAbortWatch;
  if (!w) return;
  roomEntryAbortWatch = null;
  clearTimeout(w.timer);
  if (typeof window !== "undefined") window.removeEventListener("popstate", w.onPop);
}

function isAtRoom(roomId: string): boolean {
  if (typeof window === "undefined") return false;
  const prefix = `/community-messenger/rooms/${encodeURIComponent(roomId)}`;
  const p = window.location.pathname;
  return p === prefix || p.startsWith(`${prefix}/`);
}

/**
 * 방 진입을 끝까지 정리한다 — 방이 그려지기 전에 사용자가 뒤로 나간 경우.
 * 방 화면이 아직 없으면 방의 뒤로 처리(`MessengerRoomSwipeBackShell` popstate)도 없어서, 목록 사진·회색 로딩 원이
 * 3초 상한까지 남고(실제 목록이 아닌 멈춘 사진), 진입 우선 모드·목록 그리기 멈춤·진입 잠금(2.5초)·진입 표시 상태·
 * 진입 의도(20초)가 남았다(Samsung 실측 2026-11-15 12:08 — 로딩 원 잔존·아바타 빈칸).
 */
export function abortCommunityMessengerRoomEntry(roomId: string, reason: "user_back"): void {
  void reason;
  disarmRoomEntryAbortOnBack();
  dismissMessengerRoomEntrySnapshot();
  endCmRoomEntryPriorityMode("entry_aborted");
  clearDeepRouteNavigationLock("room_entry_aborted");
  useCmRoomOpeningOverlayStore.getState().reset("room_entry_aborted");
  clearRoomEntryIntent(roomId);
}

/** 이동 직후 1회 — 방에 도착하기 전 뒤로(popstate)로 다른 주소가 되면 진입을 중단한다. 방에 도착한 뒤의 뒤로는 방이 처리한다. */
export function armRoomEntryAbortOnBack(roomId: string): void {
  if (typeof window === "undefined") return;
  disarmRoomEntryAbortOnBack();
  const onPop = () => {
    if (isAtRoom(roomId)) return;
    abortCommunityMessengerRoomEntry(roomId, "user_back");
  };
  const timer = setTimeout(disarmRoomEntryAbortOnBack, ROOM_ENTRY_ABORT_WATCH_MS);
  roomEntryAbortWatch = { roomId, onPop, timer };
  window.addEventListener("popstate", onPop);
}

/** 방 진입이 끝났으면(들어오는 움직임 완료·움직임 없는 열기) 감시를 끈다 — 방 마운트 시점이 아님(`MessengerRoomSwipeBackShell` 주석) */
export function noteRoomEntryArrived(roomId: string): void {
  if (roomEntryAbortWatch?.roomId === roomId) disarmRoomEntryAbortOnBack();
}
