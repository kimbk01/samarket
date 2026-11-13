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
import { MessengerPillarLeaveConfirmSheet } from "@/components/community-messenger/MessengerPillarLeaveConfirmSheet";
import { useMessengerPillarHeaderChrome } from "@/components/community-messenger/MessengerPillarSplitChrome";
import { StoreProfileThumb } from "@/components/community-messenger/delivery-chat-list/StoreProfileThumb";
import { DibaySecondaryTabRow } from "@/components/ui/DibaySecondaryTabRow";
import { DIBAY_SECONDARY_TAB_LABEL_CLASS, dibaySecondaryTabClass } from "@/lib/ui/dibay-secondary-tabs";
import { domainStoreOrderListRowToUnifiedItem } from "@/components/community-messenger/domain-shell-canary/domain-store-order-list-row-to-unified-item";
import { communityMessengerRoomResourcePath } from "@/lib/community-messenger/messenger-room-bootstrap";
import {
  PILLAR_MARK_ALL_READ_BUSY_ID,
  usePillarMarkAllRead,
  usePillarRoomMarkRead,
} from "@/lib/community-messenger/pillar-chat-list/use-pillar-mark-read";
import {
  customerStoreOrderDetailHref,
  filterStoreOrderChatListByTab,
  STORE_ORDER_CHAT_LIST_TABS,
  type StoreOrderChatListTab,
} from "@/lib/community-messenger/pillar-chat-list/pillar-chat-list-model";
import { buildDeliveryChatListRowModel } from "@/lib/community-messenger/delivery-chat-list/view-model";
import { formatChatListKakaoTime } from "@/lib/community-messenger/chat-list/chat-list-kakao-time";
import { STORE_ORDER_DISPLAY_STORE_FALLBACK } from "@/lib/community-messenger/store-order-display-identity";
import type { MessageKey } from "@/lib/i18n/messages";
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
        <div key={i} className="flex h-[72px] items-center gap-3 px-4" data-domain-list-row-skeleton="1">
          <div className="h-12 w-12 shrink-0 rounded-[var(--cm-chat-photo-radius,18px)] bg-sam-muted/20" />
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
const noopRoomAction = () => {};

/** 주문 채팅 목록 탭 이름 — 전체 · 진행 중 · 지난 주문 (채팅 시안 4판 「10」) */
const ORDER_TAB_LABEL_KEYS: Record<StoreOrderChatListTab, MessageKey> = {
  all: "common_all",
  live: "cm_ui_order_chats_in_progress",
  past: "cm_pillar_order_tab_past",
};

/**
 * Store Order Customer List — Domain Facts only. Production surface (no Legacy home).
 * 2026-11-10 (Owner 「1단계 구현」): 거래 목록과 같은 공용 행(MessengerChatListItem `listVisual="delivery"`)으로
 * 밀기 [읽음][나가기]·길게 누르기 메뉴·「모두 읽음」. 나가기는 주문 상태와 무관하게 허용(Owner 「주문은 지워도 상관 없다」).
 * 채팅 시안 4판 「10」: 본문 제목·안 읽음 줄 없음 → 머리글(공통 하위 머리글)에 「모두 읽음」, 둘째 줄 = 밑줄 탭
 * 전체 · 진행 중 · 지난 주문 (「지난 주문 N · 접기」 줄 대신).
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
         * Domain list authority: hydrated session cache → memory paint only.
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

  const unreadRoomCount = dto?.hub.unreadRoomCount ?? 0;
  const viewerUserIdForRows = dto?.viewerUserId ?? "";

  const unifiedItems = useMemo(
    () => (dto?.rows ?? []).map((row) => domainStoreOrderListRowToUnifiedItem(row, viewerUserIdForRows)),
    [dto, viewerUserIdForRows]
  );
  /**
   * 채팅 시안 4판 「10」 탭: 진행 중 = 끝나지 않은 주문 · 지난 주문 = 완료·취소·환불(`isStoreOrderBuyerHideAllowedStatus`).
   * 상태를 모르는 행(옛 캐시)은 진행 중으로 센다 — 숨기지 않는다.
   */
  const [orderTab, setOrderTab] = useState<StoreOrderChatListTab>("all");
  const visibleItems = useMemo(
    () => filterStoreOrderChatListByTab(unifiedItems, orderTab, (item) => item.room.contextMeta?.orderStatus),
    [orderTab, unifiedItems]
  );

  const resolveViewerUserId = useCallback(
    () => getSyncViewerUserIdForClient() ?? dto?.viewerUserId ?? "",
    [dto?.viewerUserId]
  );

  /** 방 하나 읽음 — 낙관적 0 반영, 실패 시 되돌림 (거래 채팅 목록과 같은 훅) */
  const markRoomReadById = usePillarRoomMarkRead({
    resolveViewerUserId,
    applyReadPatch: applyDomainStoreOrderListReadPatch,
    applyUnreadRestorePatch: applyDomainStoreOrderListUnreadOnlyPatch,
  });

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

  /** 머리글 「모두 읽음」 — 안 읽은 방만 동시 4개씩 (거래 채팅 목록과 같은 훅) */
  const markAllRead = usePillarMarkAllRead({
    rows: dto?.rows,
    markRoomReadById,
    setBusyId,
    setActionError,
    failureMessage: t("cm_ui_order_chat_mark_all_read_failed"),
  });
  const onHeaderMarkAll = useCallback(() => {
    void markAllRead();
  }, [markAllRead]);
  useMessengerPillarHeaderChrome("delivery", {
    canMarkAll: unreadRoomCount > 0,
    busy: busyId === PILLAR_MARK_ALL_READ_BUSY_ID,
    onMarkAll: onHeaderMarkAll,
  });

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

  /** 길게 누르기 메뉴 머리(시안 10-2): 매장 사진 44 · 매장 이름 · 「{상태} · {날짜}」 — 상태 이름은 화면 언어로 */
  const sheetItem = roomActionSheet?.item ?? null;
  const sheetHeader = useMemo(() => {
    if (!sheetItem) return null;
    const model = buildDeliveryChatListRowModel(sheetItem.room, t, language);
    const storeName = model?.storeName?.trim() || STORE_ORDER_DISPLAY_STORE_FALLBACK;
    const date = formatChatListKakaoTime(sheetItem.lastEventAt, t);
    const status = model?.statusChip?.label ?? "";
    return {
      avatar: (
        <StoreProfileThumb
          src={model?.storeThumbnailUrl}
          storeId={model?.storeId}
          storeName={storeName}
          variant="sheet"
        />
      ),
      title: storeName,
      subtitle: status && date ? t("cm_pillar_sheet_status_date", { status, date }) : status || date,
    };
  }, [language, sheetItem, t]);

  const tabRow = (
    <DibaySecondaryTabRow
      data-cm-messenger-pillar-tabs=""
      data-dibay-tab-align="start"
      bordered
      trackAriaLabel={t("cm_pillar_order_tabs_aria")}
    >
      {STORE_ORDER_CHAT_LIST_TABS.map((tab) => {
        const active = orderTab === tab;
        return (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={active}
            data-active={active ? "true" : "false"}
            data-domain-so-tab={tab}
            className={dibaySecondaryTabClass(active)}
            onClick={() => {
              setOpenedSwipeItemId(null);
              setOrderTab(tab);
            }}
          >
            <span className={DIBAY_SECONDARY_TAB_LABEL_CLASS}>{t(ORDER_TAB_LABEL_KEYS[tab])}</span>
          </button>
        );
      })}
    </DibaySecondaryTabRow>
  );

  if (mode === "loading" && !dto) {
    return (
      <div
        className="flex h-full min-h-0 flex-col bg-white"
        data-domain-so-customer-list="loading"
        data-domain-list-mode="domain"
        data-cm-pillar-screen="delivery"
        data-tablet-split={tabletSplitListOnly ? "1" : "0"}
      >
        {tabRow}
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
        className="flex h-full min-h-0 flex-col bg-white"
        data-domain-so-customer-list="error"
        data-domain-list-mode="domain"
        data-cm-pillar-screen="delivery"
      >
        {reason ? <div className="sr-only" data-domain-so-customer-error={reason} /> : null}
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

  const sheetRoom = roomActionSheet?.item.room ?? null;
  const sheetOrderDetailHref = customerStoreOrderDetailHref(sheetRoom?.contextMeta?.storeOrderId);

  return (
    <div
      className="flex h-full min-h-0 flex-col bg-white"
      data-domain-so-customer-list="1"
      data-domain-list-mode="domain"
      data-domain-so-list-swipe="canonical"
      data-domain-unread-rooms={String(unreadRoomCount)}
      data-domain-so-tab-active={orderTab}
      data-cm-pillar-screen="delivery"
      data-tablet-split={tabletSplitListOnly ? "1" : "0"}
      aria-busy={busyId === PILLAR_MARK_ALL_READ_BUSY_ID || undefined}
    >
      {tabRow}
      {actionError ? (
        <div className="px-4 py-2 text-xs text-sam-danger" data-domain-so-action-error="1">
          {actionError}
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
        {visibleItems.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-sam-muted">{t("nav_chat_order_empty")}</p>
        ) : null}
        {visibleItems.map((item) => (
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
          pillar="delivery"
          pillarHeader={sheetHeader}
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
          onViewOrderDetail={
            sheetOrderDetailHref
              ? () => {
                  setRoomActionSheet(null);
                  router.push(sheetOrderDetailHref);
                }
              : undefined
          }
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
        <MessengerPillarLeaveConfirmSheet
          title={t("cm_pillar_leave_confirm_title")}
          description={t("cm_ui_leave_confirm_delivery")}
          busy={busyId === `leave:${leaveConfirmRoom.id.trim()}`}
          onCancel={() => setLeaveConfirmRoom(null)}
          onConfirm={() => {
            void executeLeave();
          }}
        />
      ) : null}
    </div>
  );
}
