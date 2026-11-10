"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase/client";
import {
  isClientBundleKilled,
  isDomainShellReadUiCanaryViewer,
} from "@/components/community-messenger/domain-shell-canary/canary-allowlist";
import { CommunityMessengerChatRow } from "@/components/community-messenger/chat-list/CommunityMessengerChatRow";
import { MessengerChatRoomActionSheet } from "@/components/community-messenger/MessengerChatRoomActionSheet";
import type { MessengerMenuAnchorRect } from "@/components/community-messenger/MessengerChatListItem";
import { MobileConfirmBottomSheet } from "@/components/ui/MobileConfirmBottomSheet";
import { domainStoreOrderListRowToUnifiedItem } from "@/components/community-messenger/domain-shell-canary/domain-store-order-list-row-to-unified-item";
import { communityMessengerRoomResourcePath } from "@/lib/community-messenger/messenger-room-bootstrap";
import {
  buildCommunityMessengerMarkReadPatchBody,
  communityMessengerMarkReadFetchInitBase,
  parseCommunityMessengerMarkReadResponse,
} from "@/lib/community-messenger/room/community-messenger-mark-read-fetch";
import { leaveMessengerRoomFromHomeClient } from "@/lib/community-messenger/home/messenger-home-room-leave-client";
import { runCommunityMessengerRoomForwardNavigation } from "@/lib/community-messenger/community-messenger-room-forward-navigation";
import type { MessengerChatListContext } from "@/lib/community-messenger/messenger-ia";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";
import type { UnifiedRoomListItem } from "@/lib/community-messenger/use-community-messenger-home-state";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  fetchDomainListCanaryWithRetry,
  logDomainListCanaryLegacyFallback,
} from "@/components/community-messenger/domain-shell-canary/domain-list-canary-retry";
import { getSyncViewerUserIdForClient } from "@/lib/auth/get-current-user";
import {
  peekDomainStoreOrderCustomerListCanaryCache,
  primeDomainStoreOrderCustomerListCanaryCache,
  type SoCustomerListDto,
} from "@/components/community-messenger/domain-shell-canary/domain-store-order-customer-list-canary-cache";
import {
  domainSoCustomerListPaintEqual,
  stabilizeSoCustomerListDto,
} from "@/components/community-messenger/domain-shell-canary/domain-list-canary-stabilize";
import {
  applyDomainStoreOrderListMutePatch,
  applyDomainStoreOrderListReadPatch,
  applyDomainStoreOrderListRemoveRow,
  applyDomainStoreOrderListUnreadOnlyPatch,
  subscribeDomainListCanaryPatch,
} from "@/components/community-messenger/domain-shell-canary/domain-list-canary-realtime-patch";
import { MESSENGER_HUB_LIST_SCROLL_BOTTOM_INSET_CLASS } from "@/lib/layout/main-bottom-nav-hub-clearance";
import { useBottomNavOccupiesClearance } from "@/lib/layout/bottom-nav-scroll-chrome-context";
import { translateBy } from "@/lib/i18n/translate-by";

export type { SoCustomerListDto };

function clientValidate(dto: SoCustomerListDto): string | null {
  if (dto.authority !== "domain_store_order_customer_list_canary") return "invalid_authority";
  if (dto.surfaceRole !== "customer") return "owner_surface_leak";
  const rooms = new Set<string>();
  const orders = new Set<string>();
  for (const row of dto.rows) {
    if (row.chatDomain !== "store_order") return "foreign_domain_row";
    if (row.exposesMemberIdentity !== false) return "store_order_member_identity";
    if (row.storeName.trim().startsWith("@")) return "member_handle_as_store_name";
    if (!row.orderId.trim()) return "store_identity_missing";
    if (rooms.has(row.roomId) || orders.has(row.orderId)) return "duplicate_identity";
    rooms.add(row.roomId);
    orders.add(row.orderId);
  }
  if (dto.hub.roomCount !== dto.rows.length) return "hub_count_mismatch";
  const unreadRooms = dto.rows.filter((r) => r.unreadCount > 0).length;
  if (dto.hub.unreadRoomCount !== unreadRooms) return "hub_unread_mismatch";
  const latest = dto.hub.latestRoomId?.trim() ?? "";
  if (latest && dto.rows.length > 0 && !dto.rows.some((r) => r.roomId === latest)) {
    return "store_order_hub_latest_mismatch";
  }
  return null;
}

function DomainListRowSkeleton({ count = 6 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex min-h-[68px] items-center gap-3 border-b border-sam-border px-3"
          data-domain-list-row-skeleton="1"
        >
          <div className="h-12 w-12 shrink-0 rounded-full bg-sam-muted/20" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3 w-2/5 rounded bg-sam-muted/20" />
            <div className="h-3 w-3/5 rounded bg-sam-muted/15" />
          </div>
        </div>
      ))}
    </>
  );
}

/** 주문 상태·알림 끄기 원문이 없는 옛 세션 캐시 — 상태 칩·메뉴가 맞도록 네트워크로 한 번 새로 받는다. */
function soCustomerListCacheLacksLifecycleFields(dto: SoCustomerListDto): boolean {
  return dto.rows.some((r) => r.orderStatus === undefined);
}

const EMPTY_FRIEND_IDS = new Set<string>();
const MARK_ALL_READ_CONCURRENCY = 4;
const noopRoomAction = () => {};

/**
 * Store Order Customer List — Domain Facts only. Production surface (no Legacy home).
 * 2026-11-10 (Owner 「1단계 구현」): 거래 목록과 같은 공용 행(MessengerChatListItem `listVisual="delivery"`)으로
 * 밀기 [읽음][나가기]·길게 누르기 메뉴·「모두 읽음」. 나가기는 주문 상태와 무관하게 허용(Owner 「주문은 지워도 상관 없다」).
 */
export function DomainStoreOrderCustomerListCanaryGate({
  tabletSplitListOnly,
  filter: _filter,
}: {
  tabletSplitListOnly?: boolean;
  filter?: string;
}) {
  void _filter;
  const router = useRouter();
  const bottomNavOccupiesClearance = useBottomNavOccupiesClearance();
  const listScrollInsetClass = bottomNavOccupiesClearance
    ? MESSENGER_HUB_LIST_SCROLL_BOTTOM_INSET_CLASS
    : "";
  const [{ mode: initialMode, dto: initialDto }] = useState(() => {
    const syncUid = getSyncViewerUserIdForClient() ?? null;
    const cached = peekDomainStoreOrderCustomerListCanaryCache(syncUid);
    if (cached) return { mode: "ready" as const, dto: cached };
    return { mode: "loading" as const, dto: null };
  });
  const hadCacheOnMountRef = useRef(initialMode === "ready");

  const [mode, setMode] = useState<"loading" | "ready" | "error">(initialMode);
  const [dto, setDto] = useState<SoCustomerListDto | null>(initialDto);
  const [reason, setReason] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openedSwipeItemId, setOpenedSwipeItemId] = useState<string | null>(null);
  const [roomActionSheet, setRoomActionSheet] = useState<{
    item: UnifiedRoomListItem;
    listContext: MessengerChatListContext;
    anchorRect: MessengerMenuAnchorRect | null;
  } | null>(null);
  const [leaveConfirmRoom, setLeaveConfirmRoom] = useState<CommunityMessengerRoomSummary | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const { language, t } = useI18n();

  useEffect(() => {
    if (!actionError) return;
    const timer = setTimeout(() => setActionError(null), 8000);
    return () => clearTimeout(timer);
  }, [actionError]);

  const closeOpenedSwipe = useCallback(() => {
    setOpenedSwipeItemId((prev) => (prev == null ? prev : null));
  }, []);

  /** 2026-07-23: 거래 리스트와 동일 — realtime patch를 마운트 중에 반영. */
  useEffect(() => {
    const uid = getSyncViewerUserIdForClient() ?? null;
    return subscribeDomainListCanaryPatch("store_order", () => {
      const next = peekDomainStoreOrderCustomerListCanaryCache(uid);
      if (next) setDto(next);
    });
  }, []);

  const softFail = useCallback(
    (trigger: string, extra?: { httpStatus?: number | null; retried?: boolean }) => {
      logDomainListCanaryLegacyFallback({
        bundle: "store_order_customer",
        reason: trigger,
        httpStatus: extra?.httpStatus,
        retried: extra?.retried,
      });
      setReason(trigger);
      if (hadCacheOnMountRef.current) {
        setMode("ready");
        return;
      }
      setMode("error");
    },
    []
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (isClientBundleKilled("store_order_customer")) {
          softFail("bundle_killed");
          return;
        }
        const syncUid = getSyncViewerUserIdForClient() ?? null;
        /**
         * Telegram list authority: hydrated session cache → memory paint only.
         * Remount must not network-rewrite (TTL soft-skip then fetch deleted).
         * 예외: 주문 상태 원문이 없는 옛 캐시는 한 번 새로 받는다.
         */
        const cached = peekDomainStoreOrderCustomerListCanaryCache(syncUid);
        if (cached) {
          if (!cancelled) {
            setDto(cached);
            setMode("ready");
            setReason(null);
          }
          if (!soCustomerListCacheLacksLifecycleFields(cached)) return;
        }
        const sb = getSupabaseClient();
        if (!sb) {
          softFail("no_supabase");
          return;
        }
        const { data } = await sb.auth.getUser();
        const uid = data.user?.id?.trim() ?? null;
        if (!isDomainShellReadUiCanaryViewer(uid)) {
          softFail("not_allowlisted");
          return;
        }
        const fetchResult = await fetchDomainListCanaryWithRetry(
          "/api/messenger/domain-read/store-order-customer-list",
          { cache: "no-store" }
        );
        if (!fetchResult.ok) {
          softFail(fetchResult.threw ? "runtime_exception" : `http_${fetchResult.res?.status}`, {
            httpStatus: fetchResult.res?.status ?? null,
            retried: fetchResult.retried,
          });
          return;
        }
        const body = (await fetchResult.res.json()) as SoCustomerListDto;
        if (body.viewerUserId !== uid) {
          softFail("viewer_mismatch", { retried: fetchResult.retried });
          return;
        }
        const fail = clientValidate(body);
        if (fail) {
          softFail(fail, { retried: fetchResult.retried });
          return;
        }
        if (cancelled) return;
        const stable = stabilizeSoCustomerListDto(body);
        primeDomainStoreOrderCustomerListCanaryCache(stable);
        setDto((prev) => (domainSoCustomerListPaintEqual(prev, stable) ? prev : stable));
        setMode("ready");
        setReason(null);
      } catch {
        if (!cancelled) softFail("runtime_exception");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [softFail]);

  const title = translateBy(language, "community_messenger_order_chats");
  const unreadRoomCount = dto?.hub.unreadRoomCount ?? 0;
  const viewerUserIdForRows = dto?.viewerUserId ?? "";

  const unifiedItems = useMemo(
    () => (dto?.rows ?? []).map((row) => domainStoreOrderListRowToUnifiedItem(row, viewerUserIdForRows)),
    [dto, viewerUserIdForRows]
  );

  const resolveViewerUserId = useCallback(
    () => getSyncViewerUserIdForClient() ?? dto?.viewerUserId ?? "",
    [dto?.viewerUserId]
  );

  /** 방 하나 읽음 — 낙관적 0 반영, 실패 시 되돌림. 성공 여부를 돌려준다. */
  const markRoomReadById = useCallback(
    async (roomId: string, preUnread: number): Promise<boolean> => {
      const viewerUserId = resolveViewerUserId();
      if (viewerUserId) applyDomainStoreOrderListReadPatch({ viewerUserId, roomId });
      const restore = () => {
        if (viewerUserId && preUnread > 0) {
          applyDomainStoreOrderListUnreadOnlyPatch({
            viewerUserId,
            roomId,
            unreadCount: preUnread,
            mutationType: "PARTICIPANT_UNREAD",
          });
        }
      };
      try {
        const res = await fetch(communityMessengerRoomResourcePath(roomId), {
          ...communityMessengerMarkReadFetchInitBase,
          body: JSON.stringify(buildCommunityMessengerMarkReadPatchBody()),
        });
        const parsed = await parseCommunityMessengerMarkReadResponse(res);
        if (!parsed.okHttp || parsed.json.ok !== true) {
          restore();
          return false;
        }
        return true;
      } catch {
        restore();
        return false;
      }
    },
    [resolveViewerUserId]
  );

  const markRoomRead = useCallback(
    async (room: CommunityMessengerRoomSummary) => {
      const roomId = room.id.trim();
      if (!roomId) return;
      setBusyId(`read:${roomId}`);
      setActionError(null);
      try {
        const ok = await markRoomReadById(roomId, Math.max(0, Math.floor(Number(room.unreadCount) || 0)));
        if (!ok) setActionError(t("cm_ui_order_chat_mark_all_read_failed"));
      } finally {
        setBusyId(null);
      }
    },
    [markRoomReadById, t]
  );

  const markAllRead = useCallback(async () => {
    const targets = (dto?.rows ?? []).filter((r) => r.unreadCount > 0);
    if (targets.length === 0) return;
    setBusyId("read:all");
    setActionError(null);
    let failed = 0;
    try {
      for (let i = 0; i < targets.length; i += MARK_ALL_READ_CONCURRENCY) {
        const chunk = targets.slice(i, i + MARK_ALL_READ_CONCURRENCY);
        const results = await Promise.all(chunk.map((r) => markRoomReadById(r.roomId, r.unreadCount)));
        failed += results.filter((ok) => !ok).length;
      }
      if (failed > 0) setActionError(t("cm_ui_order_chat_mark_all_read_failed"));
    } finally {
      setBusyId(null);
    }
  }, [dto?.rows, markRoomReadById, t]);

  const toggleMute = useCallback(
    async (room: CommunityMessengerRoomSummary) => {
      const roomId = room.id.trim();
      if (!roomId) return;
      const nextMuted = !room.isMuted;
      setBusyId(`settings:${roomId}`);
      setActionError(null);
      try {
        const res = await fetch(communityMessengerRoomResourcePath(roomId), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "participant_settings", isMuted: nextMuted }),
        });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!res.ok || !json.ok) {
          setActionError(json.error ?? "room_settings_update_failed");
          return;
        }
        const viewerUserId = resolveViewerUserId();
        if (viewerUserId) applyDomainStoreOrderListMutePatch({ viewerUserId, roomId, isMuted: nextMuted });
      } finally {
        setBusyId(null);
      }
    },
    [resolveViewerUserId]
  );

  const requestLeave = useCallback((room: CommunityMessengerRoomSummary) => {
    setOpenedSwipeItemId(null);
    setLeaveConfirmRoom(room);
  }, []);

  const executeLeave = useCallback(async () => {
    const room = leaveConfirmRoom;
    if (!room) return;
    setLeaveConfirmRoom(null);
    const roomId = room.id.trim();
    setBusyId(`leave:${roomId}`);
    setActionError(null);
    try {
      const result = await leaveMessengerRoomFromHomeClient({ roomId, roomType: room.roomType });
      if (result.ok) {
        const viewerUserId = resolveViewerUserId();
        if (viewerUserId) applyDomainStoreOrderListRemoveRow({ viewerUserId, roomId });
        setRoomActionSheet(null);
      } else {
        setActionError(result.error ?? "leave_failed");
      }
    } finally {
      setBusyId(null);
    }
  }, [leaveConfirmRoom, resolveViewerUserId]);

  const handleOpenRoomActions = useCallback(
    (
      item: UnifiedRoomListItem,
      listContext: MessengerChatListContext,
      anchorRect: MessengerMenuAnchorRect | null
    ) => {
      setOpenedSwipeItemId(null);
      setRoomActionSheet({ item, listContext, anchorRect });
    },
    []
  );

  if (mode === "loading" && !dto) {
    return (
      <div
        className="flex h-full min-h-0 flex-col bg-sam-app"
        data-domain-so-customer-list="loading"
        data-domain-list-mode="domain"
        data-tablet-split={tabletSplitListOnly ? "1" : "0"}
      >
        {!tabletSplitListOnly ? (
          <div className="border-b border-sam-border px-4 py-3">
            <div className="text-base font-semibold text-sam-fg">{title}</div>
          </div>
        ) : null}
        <div
          className={`min-h-0 flex-1 overflow-y-auto ${listScrollInsetClass}`}
          data-messenger-hub-list-scroll=""
          data-cm-list-scroll-bottom-inset={bottomNavOccupiesClearance ? "1" : "0"}
        >
          <DomainListRowSkeleton />
        </div>
      </div>
    );
  }

  if ((mode === "error" && !dto) || (!dto && mode !== "loading")) {
    return (
      <div
        className="flex h-full min-h-0 flex-col bg-sam-app"
        data-domain-so-customer-list="error"
        data-domain-list-mode="domain"
      >
        {reason ? <div className="sr-only" data-domain-so-customer-error={reason} /> : null}
        {!tabletSplitListOnly ? (
          <div className="border-b border-sam-border px-4 py-3">
            <div className="text-base font-semibold text-sam-fg">{title}</div>
          </div>
        ) : null}
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 px-4 text-sm text-sam-muted">
          <p>{translateBy(language, "community_messenger_couldn_t_load_order_chats")}</p>
          <button
            type="button"
            className="rounded-md bg-sam-primary px-3 py-1.5 text-xs text-white"
            onClick={() => {
              setMode("loading");
              setReason(null);
              window.location.reload();
            }}
          >
            {translateBy(language, "community_messenger_retry")}
          </button>
        </div>
      </div>
    );
  }

  if (!dto) return null;

  const markAllBusy = busyId === "read:all";
  const markAllButton =
    unreadRoomCount > 0 ? (
      <button
        type="button"
        className="shrink-0 text-xs font-semibold text-sam-primary disabled:opacity-50"
        disabled={Boolean(busyId)}
        onClick={() => void markAllRead()}
        data-domain-so-mark-all-read=""
      >
        {t("common_mark_all_read")}
      </button>
    ) : null;
  const sheetRoom = roomActionSheet?.item.room ?? null;

  return (
    <div
      className="flex h-full min-h-0 flex-col bg-sam-app"
      data-domain-so-customer-list="1"
      data-domain-list-mode="domain"
      data-domain-so-list-swipe="canonical"
      data-domain-unread-rooms={String(unreadRoomCount)}
      data-tablet-split={tabletSplitListOnly ? "1" : "0"}
      aria-busy={markAllBusy || undefined}
    >
      {!tabletSplitListOnly || markAllButton || actionError ? (
        <div className="border-b border-sam-border px-4 py-3">
          <div className="flex items-center gap-2">
            {!tabletSplitListOnly ? (
              <div className="min-w-0 flex-1">
                <div className="text-base font-semibold text-sam-fg">{title}</div>
                {unreadRoomCount > 0 ? (
                  <div className="text-xs text-sam-muted">
                    {translateBy(language, "community_messenger_unreadroomcount_unread", { unreadRoomCount })}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="min-w-0 flex-1" />
            )}
            {markAllButton}
          </div>
          {actionError ? (
            <div className="mt-2 text-xs text-sam-danger" data-domain-so-action-error="1">
              {actionError}
            </div>
          ) : null}
        </div>
      ) : null}
      <div
        className={`min-h-0 flex-1 overflow-y-auto ${listScrollInsetClass}`}
        data-messenger-hub-list-scroll=""
        data-cm-list-scroll-bottom-inset={bottomNavOccupiesClearance ? "1" : "0"}
        onScrollCapture={closeOpenedSwipe}
        onPointerDownCapture={(e) => {
          const target = e.target;
          if (!(target instanceof Element)) return;
          if (target.closest("[data-messenger-chat-row='true']")) return;
          closeOpenedSwipe();
        }}
      >
        {unifiedItems.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-sam-muted">{t("nav_chat_order_empty")}</p>
        ) : null}
        {unifiedItems.map((item) => (
          <CommunityMessengerChatRow
            key={item.room.id}
            item={item}
            viewerUserId={dto.viewerUserId}
            favoriteFriendIds={EMPTY_FRIEND_IDS}
            busyId={busyId}
            onTogglePin={noopRoomAction}
            onToggleMute={(room) => void toggleMute(room)}
            onMarkRead={(room) => void markRoomRead(room)}
            onToggleArchive={noopRoomAction}
            onLeaveRoom={requestLeave}
            onOpenRoomActions={handleOpenRoomActions}
            listContext="default"
            openedSwipeItemId={openedSwipeItemId}
            onOpenSwipeItem={setOpenedSwipeItemId}
            listVisual="delivery"
          />
        ))}
      </div>

      {roomActionSheet && sheetRoom ? (
        <MessengerChatRoomActionSheet
          item={roomActionSheet.item}
          listContext={roomActionSheet.listContext}
          anchorRect={roomActionSheet.anchorRect}
          busyId={busyId}
          onClose={() => setRoomActionSheet(null)}
          onEnterRoom={() => {
            setRoomActionSheet(null);
            void runCommunityMessengerRoomForwardNavigation({
              router,
              roomId: sheetRoom.id,
              listSource: "delivery",
              fromEntryOrigin: "delivery",
              viewerUserId: dto.viewerUserId,
              roomForPrime: sheetRoom,
            });
          }}
          onToggleMute={() => {
            setRoomActionSheet(null);
            void toggleMute(sheetRoom);
          }}
          onMarkRead={() => {
            setRoomActionSheet(null);
            void markRoomRead(sheetRoom);
          }}
          onLeave={() => {
            setRoomActionSheet(null);
            requestLeave(sheetRoom);
          }}
        />
      ) : null}

      {leaveConfirmRoom ? (
        <MobileConfirmBottomSheet
          open
          onCancel={() => setLeaveConfirmRoom(null)}
          title={t("popup_chat_room_leave_title")}
          description={t("cm_ui_leave_confirm_delivery")}
          cancelLabel={t("common_cancel")}
          confirmLabel={t("popup_cta_leave")}
          confirmTone="danger"
          onConfirm={() => {
            void executeLeave();
          }}
          zIndexClass="z-[70]"
          ariaLabel={t("cm_ui_leave_confirm_aria")}
          interactionMode="blocking"
        />
      ) : null}
    </div>
  );
}
