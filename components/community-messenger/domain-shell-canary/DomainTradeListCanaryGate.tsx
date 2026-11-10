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
import { DibaySecondaryTabRow } from "@/components/ui/DibaySecondaryTabRow";
import { DIBAY_SECONDARY_TAB_LABEL_CLASS, dibaySecondaryTabClass } from "@/lib/ui/dibay-secondary-tabs";
import { domainTradeListRowToUnifiedItem } from "@/components/community-messenger/domain-shell-canary/domain-trade-list-row-to-unified-item";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  fetchDomainListCanaryWithRetry,
  logDomainListCanaryLegacyFallback,
} from "@/components/community-messenger/domain-shell-canary/domain-list-canary-retry";
import { getSyncViewerUserIdForClient } from "@/lib/auth/get-current-user";
import {
  peekDomainTradeListCanaryCache,
  primeDomainTradeListCanaryCache,
} from "@/components/community-messenger/domain-shell-canary/domain-trade-list-canary-cache";
import {
  domainTradeListPaintEqual,
  stabilizeTradeListDto,
} from "@/components/community-messenger/domain-shell-canary/domain-list-canary-stabilize";
import {
  applyDomainTradeListReadPatch,
  applyDomainTradeListRemoveRow,
  applyDomainTradeListUnreadOnlyPatch,
  subscribeDomainListCanaryPatch,
} from "@/components/community-messenger/domain-shell-canary/domain-list-canary-realtime-patch";
import { useDomainListCanaryHomeRealtime } from "@/lib/community-messenger/home/use-domain-list-canary-home-realtime";
import {
  filterTradeListRowsByRole,
  type TradeListRoleFilter,
} from "@/lib/messenger/trade/list-sort-filter";
import { MESSENGER_HUB_LIST_SCROLL_BOTTOM_INSET_CLASS } from "@/lib/layout/main-bottom-nav-hub-clearance";
import { useBottomNavOccupiesClearance } from "@/lib/layout/bottom-nav-scroll-chrome-context";
import { communityMessengerRoomResourcePath } from "@/lib/community-messenger/messenger-room-bootstrap";
import {
  PILLAR_MARK_ALL_READ_BUSY_ID,
  usePillarMarkAllRead,
  usePillarRoomMarkRead,
} from "@/lib/community-messenger/pillar-chat-list/use-pillar-mark-read";
import { leaveMessengerRoomFromHomeClient } from "@/lib/community-messenger/home/messenger-home-room-leave-client";
import { runCommunityMessengerRoomForwardNavigation } from "@/lib/community-messenger/community-messenger-room-forward-navigation";
import { getSwipeLeaveConfirmI18nKey } from "@/lib/messenger-policy/chat-room-swipe-actions";
import { toMessengerPolicyRoomType } from "@/lib/messenger-policy/messenger-policy-room-type";
import type { MessengerChatListContext } from "@/lib/community-messenger/messenger-ia";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";
import type { UnifiedRoomListItem } from "@/lib/community-messenger/use-community-messenger-home-state";
import { translateBy } from "@/lib/i18n/translate-by";
import type { MessageKey } from "@/lib/i18n/messages";

export type TradeListDto = {
  authority: "domain_trade_list_canary";
  viewerUserId: string;
  producedAt: string;
  hub: {
    roomCount: number;
    unreadRoomCount: number;
    latestRoomId: string | null;
    previewText: string;
  };
  rows: Array<{
    roomId: string;
    chatDomain: "trade";
    domainIdentityKey: string;
    itemId: string;
    /** May be absent on legacy session cache — stabilize recomputes from identity */
    sellerUserId?: string;
    buyerUserId?: string;
    viewerRole?: "seller" | "buyer";
    productTitle: string;
    productImageUrl: string | null;
    peerLabel: string | null;
    peerAvatarUrl?: string | null;
    previewText: string;
    previewIsSystemEvent?: boolean;
    statusBadge: string | null;
    unreadCount: number;
    needsResponse?: boolean;
    lastMessageAt: string;
    href: string;
  }>;
};

function clientValidate(dto: TradeListDto): string | null {
  if (dto.authority !== "domain_trade_list_canary") return "invalid_authority";
  const ids = new Set<string>();
  for (const row of dto.rows) {
    if (row.chatDomain !== "trade") return "foreign_domain_row";
    if (!row.itemId.trim()) return "product_identity_missing";
    if (row.viewerRole !== "seller" && row.viewerRole !== "buyer") return "trade_viewer_role_missing";
    if (!(row.sellerUserId ?? "").trim() || !(row.buyerUserId ?? "").trim()) {
      return "trade_parties_missing";
    }
    if (ids.has(row.roomId)) return "duplicate_room_id";
    ids.add(row.roomId);
  }
  if (dto.hub.roomCount !== dto.rows.length) return "hub_count_mismatch";
  const unreadRooms = dto.rows.filter((r) => r.unreadCount > 0).length;
  if (dto.hub.unreadRoomCount !== unreadRooms) return "hub_unread_mismatch";
  const latest = dto.hub.latestRoomId?.trim() ?? "";
  if (latest && dto.rows.length > 0 && !dto.rows.some((r) => r.roomId === latest)) {
    return "trade_hub_latest_mismatch";
  }
  return null;
}

function DomainListRowSkeleton({ count = 6 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex h-[84px] items-center gap-3 px-4" data-domain-list-row-skeleton="1">
          <div className="h-12 w-12 shrink-0 rounded-[var(--cm-chat-avatar-radius,18px)] bg-sam-muted/20" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3 w-2/5 rounded bg-sam-muted/20" />
            <div className="h-3 w-3/5 rounded bg-sam-muted/15" />
            <div className="h-3 w-4/5 rounded bg-sam-muted/10" />
          </div>
        </div>
      ))}
    </>
  );
}

const ROLE_FILTERS: TradeListRoleFilter[] = ["all", "selling", "buying"];

/** 거래 채팅 목록 탭 이름 — 전체 · 판매 · 구매 (채팅 시안 4판 「9」, 역할 필터 `filterTradeListRowsByRole` 그대로) */
const ROLE_FILTER_LABEL_KEYS: Record<TradeListRoleFilter, MessageKey> = {
  all: "cm_trade_chat_filter_all",
  selling: "cm_trade_chat_filter_selling",
  buying: "cm_trade_chat_filter_buying",
};

const EMPTY_FRIEND_IDS = new Set<string>();

/**
 * Trade Hub→List — Domain Facts authority + canonical MessengerChatListItem swipe.
 * Cache/seed paints immediately; refresh merges in background.
 * Role filter is a selector on one trade authority list (no extra store).
 * 채팅 시안 4판 「9」: 본문 제목·안 읽음 줄 없음 → 머리글(공통 하위 머리글)에 「모두 읽음」, 둘째 줄 = 밑줄 탭 전체 · 판매 · 구매.
 */
export function DomainTradeListCanaryGate({
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
  const [{ mode: initialMode, dto: initialDto, needsRefetch: initialNeedsRefetch }] = useState(() => {
    const syncUid = getSyncViewerUserIdForClient() ?? null;
    const cached = peekDomainTradeListCanaryCache(syncUid);
    if (cached) {
      const stabilized = stabilizeTradeListDto(cached);
      if (stabilized.dto.rows.length > 0 || cached.rows.length === 0) {
        primeDomainTradeListCanaryCache(stabilized.dto);
        return {
          mode: "ready" as const,
          dto: stabilized.dto,
          needsRefetch: stabilized.needsBackgroundRefetch,
        };
      }
      // All rows invalid — do not paint buyer fallback; wait for network.
      return { mode: "loading" as const, dto: null, needsRefetch: true };
    }
    return { mode: "loading" as const, dto: null, needsRefetch: false };
  });
  const hadCacheOnMountRef = useRef(initialMode === "ready");
  const needsBackgroundRefetchRef = useRef(initialNeedsRefetch);

  const [mode, setMode] = useState<"loading" | "ready" | "error">(initialMode);
  const [dto, setDto] = useState<TradeListDto | null>(initialDto);
  const [reason, setReason] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<TradeListRoleFilter>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openedSwipeItemId, setOpenedSwipeItemId] = useState<string | null>(null);
  const [roomActionSheet, setRoomActionSheet] = useState<{
    item: UnifiedRoomListItem;
    listContext: MessengerChatListContext;
    anchorRect: MessengerMenuAnchorRect | null;
  } | null>(null);
  const [leaveConfirmRoom, setLeaveConfirmRoom] = useState<CommunityMessengerRoomSummary | null>(
    null
  );
  const [actionError, setActionError] = useState<string | null>(null);
  /** L-10 — actionError 8초 후 정리 */
  useEffect(() => {
    if (!actionError) return;
    const timer = setTimeout(() => setActionError(null), 8000);
    return () => clearTimeout(timer);
  }, [actionError]);
  const { language, t } = useI18n();
  /** L-5 — Home 과 동일: 스크롤·외부 탭 시 스와이프 닫기 */
  const closeOpenedSwipe = useCallback(() => {
    setOpenedSwipeItemId((prev) => (prev == null ? prev : null));
  }, []);

  useEffect(() => {
    const uid = getSyncViewerUserIdForClient() ?? null;
    return subscribeDomainListCanaryPatch("trade", () => {
      const next = peekDomainTradeListCanaryCache(uid);
      if (!next) return;
      const stabilized = stabilizeTradeListDto(next);
      primeDomainTradeListCanaryCache(stabilized.dto);
      setDto(stabilized.dto);
    });
  }, []);

  const softFail = useCallback(
    (trigger: string, extra?: { httpStatus?: number | null; retried?: boolean }) => {
      logDomainListCanaryLegacyFallback({
        bundle: "trade",
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
        if (isClientBundleKilled("trade")) {
          softFail("bundle_killed");
          return;
        }
        const syncUid = getSyncViewerUserIdForClient() ?? null;
        const cached = peekDomainTradeListCanaryCache(syncUid);
        // Paint-first from cache, then always merge a network refresh.
        // Skipping fetch after a warm cache left swipe mark_read disabled while
        // domain-read API already had unreadCount > 0 (stale React row).
        if (cached) {
          const stabilized = stabilizeTradeListDto(cached);
          if (!cancelled) {
            primeDomainTradeListCanaryCache(stabilized.dto);
            setDto(stabilized.dto);
            setMode("ready");
            setReason(null);
          }
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
          "/api/messenger/domain-read/trade-list",
          { cache: "no-store" }
        );
        if (!fetchResult.ok) {
          softFail(fetchResult.threw ? "runtime_exception" : `http_${fetchResult.res?.status}`, {
            httpStatus: fetchResult.res?.status ?? null,
            retried: fetchResult.retried,
          });
          return;
        }
        const body = (await fetchResult.res.json()) as TradeListDto;
        if (body.viewerUserId !== uid) {
          softFail("viewer_mismatch", { retried: fetchResult.retried });
          return;
        }
        const stabilized = stabilizeTradeListDto(body);
        const fail = clientValidate(stabilized.dto);
        if (fail) {
          softFail(fail, { retried: fetchResult.retried });
          return;
        }
        if (cancelled) return;
        needsBackgroundRefetchRef.current = false;
        primeDomainTradeListCanaryCache(stabilized.dto);
        setDto((prev) => (domainTradeListPaintEqual(prev, stabilized.dto) ? prev : stabilized.dto));
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

  const visibleRows = useMemo(() => {
    if (!dto) return [];
    return filterTradeListRowsByRole(
      dto.rows
        .filter((r) => r.viewerRole === "seller" || r.viewerRole === "buyer")
        .map((r) => ({
          ...r,
          viewerRole: r.viewerRole as "seller" | "buyer",
          needsResponse: r.needsResponse ?? r.unreadCount > 0,
        })),
      roleFilter
    );
  }, [dto, roleFilter]);

  const unifiedItems = useMemo(
    () => visibleRows.map((row) => domainTradeListRowToUnifiedItem(row)),
    [visibleRows]
  );

  const homeRealtimeRoomIds = useMemo(
    () => (dto?.rows ?? []).map((r) => r.roomId).filter(Boolean),
    [dto]
  );
  useDomainListCanaryHomeRealtime({
    viewerUserId: dto?.viewerUserId ?? null,
    roomIds: homeRealtimeRoomIds,
    enabled: mode === "ready" && Boolean(dto?.viewerUserId),
  });

  const patchRoomParticipant = useCallback(
    async (roomId: string, patch: { isPinned?: boolean; isMuted?: boolean }) => {
      setBusyId(`settings:${roomId}`);
      setActionError(null);
      try {
        const res = await fetch(communityMessengerRoomResourcePath(roomId), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "participant_settings", ...patch }),
        });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!res.ok || !json.ok) {
          setActionError(json.error ?? "room_settings_update_failed");
        }
      } finally {
        setBusyId(null);
      }
    },
    []
  );

  const resolveViewerUserId = useCallback(
    () => getSyncViewerUserIdForClient() ?? dto?.viewerUserId ?? "",
    [dto?.viewerUserId]
  );

  /** 방 하나 읽음 — 낙관적 0 반영, 실패 시 되돌림 (주문 채팅 목록과 같은 훅) */
  const markRoomReadById = usePillarRoomMarkRead({
    resolveViewerUserId,
    applyReadPatch: applyDomainTradeListReadPatch,
    applyUnreadRestorePatch: applyDomainTradeListUnreadOnlyPatch,
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

  /**
   * 머리글 「모두 읽음」 — 주문 채팅 목록과 같은 방식(안 읽은 방만 동시 4개씩 읽음 처리).
   * 대상은 탭과 관계없이 거래 목록 전체(머리글 동작은 화면 전체에 대한 것).
   */
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
  useMessengerPillarHeaderChrome("trade", {
    canMarkAll: unreadRoomCount > 0,
    busy: busyId === PILLAR_MARK_ALL_READ_BUSY_ID,
    onMarkAll: onHeaderMarkAll,
  });

  const toggleRoomArchive = useCallback(
    async (room: CommunityMessengerRoomSummary) => {
      const roomId = room.id.trim();
      if (!roomId) return;
      const viewerUserId = getSyncViewerUserIdForClient() ?? dto?.viewerUserId ?? "";
      setBusyId(`archive:${roomId}`);
      setActionError(null);
      try {
        const res = await fetch(communityMessengerRoomResourcePath(roomId), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "archive", archived: true }),
        });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!res.ok || !json.ok) {
          setActionError(json.error ?? "room_archive_update_failed");
          return;
        }
        if (viewerUserId) {
          applyDomainTradeListRemoveRow({ viewerUserId, roomId, reason: "archive" });
        }
        setOpenedSwipeItemId(null);
        setRoomActionSheet(null);
      } finally {
        setBusyId(null);
      }
    },
    [dto?.viewerUserId]
  );

  const leaveMessengerRoom = useCallback((room: CommunityMessengerRoomSummary) => {
    setLeaveConfirmRoom(room);
    setOpenedSwipeItemId(null);
  }, []);

  const leaveConfirmI18nKey = useMemo(() => {
    if (!leaveConfirmRoom) return null;
    const isDeliveryRoom =
      leaveConfirmRoom.contextMeta?.kind === "delivery" ||
      Boolean(
        (leaveConfirmRoom.messengerDirectKey ?? "").startsWith("store_order:") ||
          (leaveConfirmRoom.messengerDirectKey ?? "").startsWith("trade_order:")
      );
    return getSwipeLeaveConfirmI18nKey(
      toMessengerPolicyRoomType({
        roomType: leaveConfirmRoom.roomType,
        contextMeta: leaveConfirmRoom.contextMeta ?? null,
      }),
      { isDeliveryRoom }
    );
  }, [leaveConfirmRoom]);

  const executeLeaveMessengerRoom = useCallback(async () => {
    const room = leaveConfirmRoom;
    if (!room) return;
    setLeaveConfirmRoom(null);
    const roomId = room.id.trim();
    const viewerUserId = getSyncViewerUserIdForClient() ?? dto?.viewerUserId ?? "";
    setBusyId(`leave:${roomId}`);
    setActionError(null);
    try {
      const result = await leaveMessengerRoomFromHomeClient({
        roomId,
        roomType: room.roomType,
      });
      if (result.ok) {
        if (viewerUserId) {
          applyDomainTradeListRemoveRow({ viewerUserId, roomId, reason: "leave" });
        }
        setRoomActionSheet(null);
      } else {
        setActionError(result.error ?? "leave_failed");
      }
    } finally {
      setBusyId(null);
    }
  }, [dto?.viewerUserId, leaveConfirmRoom]);

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

  const handleTogglePin = useCallback(
    (room: CommunityMessengerRoomSummary) => {
      void patchRoomParticipant(room.id, { isPinned: !room.isPinned });
    },
    [patchRoomParticipant]
  );

  const handleToggleMute = useCallback(
    (room: CommunityMessengerRoomSummary) => {
      void patchRoomParticipant(room.id, { isMuted: !room.isMuted });
    },
    [patchRoomParticipant]
  );

  const tabRow = (
    <DibaySecondaryTabRow
      data-cm-messenger-pillar-tabs=""
      data-dibay-tab-align="start"
      bordered
      trackAriaLabel={t("cm_pillar_trade_tabs_aria")}
    >
      {ROLE_FILTERS.map((id) => {
        const active = roleFilter === id;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active}
            data-active={active ? "true" : "false"}
            data-trade-role-tab={id}
            className={dibaySecondaryTabClass(active)}
            onClick={() => {
              setOpenedSwipeItemId(null);
              setRoleFilter(id);
            }}
          >
            <span className={DIBAY_SECONDARY_TAB_LABEL_CLASS}>{t(ROLE_FILTER_LABEL_KEYS[id])}</span>
          </button>
        );
      })}
    </DibaySecondaryTabRow>
  );

  if (mode === "loading" && !dto) {
    return (
      <div
        className="flex h-full min-h-0 flex-col bg-white"
        data-domain-trade-list="loading"
        data-domain-list-mode="domain"
        data-cm-pillar-screen="trade"
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
        data-domain-trade-list="error"
        data-domain-list-mode="domain"
        data-cm-pillar-screen="trade"
      >
        {reason ? <div className="sr-only" data-domain-trade-error={reason} /> : null}
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 px-4 text-sm text-sam-muted">
          <p>{translateBy(language, "community_messenger_couldn_t_load_trade_chats")}</p>
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

  return (
    <div
      className="flex h-full min-h-0 flex-col bg-white"
      data-domain-trade-list="1"
      data-domain-list-mode="domain"
      data-domain-trade-list-swipe="canonical"
      data-domain-unread-rooms={String(unreadRoomCount)}
      data-trade-role-filter={roleFilter}
      data-cm-pillar-screen="trade"
      data-tablet-split={tabletSplitListOnly ? "1" : "0"}
      aria-busy={busyId === PILLAR_MARK_ALL_READ_BUSY_ID || undefined}
    >
      {tabRow}
      {actionError ? (
        <div className="px-4 py-2 text-xs text-sam-danger" data-domain-trade-action-error="1">
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
        {unifiedItems.map((item) => (
          <CommunityMessengerChatRow
            key={item.room.id}
            item={item}
            viewerUserId={dto.viewerUserId}
            favoriteFriendIds={EMPTY_FRIEND_IDS}
            busyId={busyId}
            onTogglePin={handleTogglePin}
            onToggleMute={handleToggleMute}
            onMarkRead={(room) => void markRoomRead(room)}
            onToggleArchive={(room) => void toggleRoomArchive(room)}
            onLeaveRoom={leaveMessengerRoom}
            onOpenRoomActions={handleOpenRoomActions}
            listContext="default"
            openedSwipeItemId={openedSwipeItemId}
            onOpenSwipeItem={setOpenedSwipeItemId}
            listVisual="trade"
          />
        ))}
      </div>

      {roomActionSheet ? (
        <MessengerChatRoomActionSheet
          item={roomActionSheet.item}
          listContext={roomActionSheet.listContext}
          anchorRect={roomActionSheet.anchorRect}
          busyId={busyId}
          pillar="trade"
          onClose={() => setRoomActionSheet(null)}
          onEnterRoom={() => {
            const room = roomActionSheet.item.room;
            setRoomActionSheet(null);
            void runCommunityMessengerRoomForwardNavigation({
              router,
              roomId: room.id,
              listSource: "trade",
              fromEntryOrigin: "trade",
              viewerUserId: dto.viewerUserId,
              roomForPrime: room,
            });
          }}
          onTogglePin={() => {
            const room = roomActionSheet.item.room;
            setRoomActionSheet(null);
            void patchRoomParticipant(room.id, { isPinned: !room.isPinned });
          }}
          onToggleMute={() => {
            const room = roomActionSheet.item.room;
            setRoomActionSheet(null);
            void patchRoomParticipant(room.id, { isMuted: !room.isMuted });
          }}
          onMarkRead={() => {
            const room = roomActionSheet.item.room;
            setRoomActionSheet(null);
            void markRoomRead(room);
          }}
          onToggleArchive={() => {
            const room = roomActionSheet.item.room;
            setRoomActionSheet(null);
            void toggleRoomArchive(room);
          }}
          onLeave={() => {
            const room = roomActionSheet.item.room;
            setRoomActionSheet(null);
            leaveMessengerRoom(room);
          }}
        />
      ) : null}

      {leaveConfirmRoom && leaveConfirmI18nKey ? (
        <MessengerPillarLeaveConfirmSheet
          title={t("popup_chat_room_leave_title")}
          busy={busyId === `leave:${leaveConfirmRoom.id.trim()}`}
          onCancel={() => setLeaveConfirmRoom(null)}
          onConfirm={() => {
            void executeLeaveMessengerRoom();
          }}
        />
      ) : null}
    </div>
  );
}
