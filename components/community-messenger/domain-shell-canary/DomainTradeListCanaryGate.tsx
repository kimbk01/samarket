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
import {
  filterTradeListRowsByRole,
  type TradeListRoleFilter,
} from "@/lib/messenger/trade/list-sort-filter";
import { MESSENGER_HUB_LIST_SCROLL_BOTTOM_INSET_CLASS } from "@/lib/layout/main-bottom-nav-hub-clearance";
import { useBottomNavOccupiesClearance } from "@/lib/layout/bottom-nav-scroll-chrome-context";
import { communityMessengerRoomResourcePath } from "@/lib/community-messenger/messenger-room-bootstrap";
import {
  buildCommunityMessengerMarkReadPatchBody,
  communityMessengerMarkReadFetchInitBase,
  parseCommunityMessengerMarkReadResponse,
} from "@/lib/community-messenger/room/community-messenger-mark-read-fetch";
import { leaveMessengerRoomFromHomeClient } from "@/lib/community-messenger/home/messenger-home-room-leave-client";
import { runCommunityMessengerRoomForwardNavigation } from "@/lib/community-messenger/community-messenger-room-forward-navigation";
import { getSwipeLeaveConfirmI18nKey } from "@/lib/messenger-policy/chat-room-swipe-actions";
import { toMessengerPolicyRoomType } from "@/lib/messenger-policy/messenger-policy-room-type";
import type { MessengerChatListContext } from "@/lib/community-messenger/messenger-ia";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";
import type { UnifiedRoomListItem } from "@/lib/community-messenger/use-community-messenger-home-state";

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
        <div
          key={i}
          className="flex min-h-[76px] items-center gap-3 border-b border-sam-border px-3"
          data-domain-list-row-skeleton="1"
        >
          <div className="h-12 w-12 shrink-0 rounded-ui-rect bg-sam-muted/20" />
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

const EMPTY_FRIEND_IDS = new Set<string>();

/**
 * Trade Hub→List — Domain Facts authority + canonical MessengerChatListItem swipe.
 * Cache/seed paints immediately; refresh merges in background.
 * Role filter is a selector on one trade authority list (no extra store).
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
  const { language, t, safeT } = useI18n();

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
        if (cached && !needsBackgroundRefetchRef.current) {
          const stabilized = stabilizeTradeListDto(cached);
          if (!cancelled) {
            primeDomainTradeListCanaryCache(stabilized.dto);
            setDto(stabilized.dto);
            setMode("ready");
            setReason(null);
          }
          return;
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

  const title = language === "en" ? "Trade chats" : "거래 채팅";
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

  const filterLabel = (id: TradeListRoleFilter) => {
    if (id === "all") {
      return safeT("cm_trade_chat_filter_all", { fallbackKo: "전체", fallbackEn: "All" });
    }
    if (id === "selling") {
      return safeT("cm_trade_chat_filter_selling", { fallbackKo: "판매", fallbackEn: "Selling" });
    }
    return safeT("cm_trade_chat_filter_buying", { fallbackKo: "구매", fallbackEn: "Buying" });
  };

  const patchRoomParticipant = useCallback(
    async (roomId: string, patch: { isPinned?: boolean; isMuted?: boolean }) => {
      setBusyId(`room-settings:${roomId}`);
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

  const markRoomRead = useCallback(
    async (room: CommunityMessengerRoomSummary) => {
      const roomId = room.id.trim();
      if (!roomId) return;
      const viewerUserId = getSyncViewerUserIdForClient() ?? dto?.viewerUserId ?? "";
      setBusyId(`room-read:${roomId}`);
      setActionError(null);
      const preUnread = Math.max(0, Math.floor(Number(room.unreadCount) || 0));
      if (viewerUserId) {
        applyDomainTradeListReadPatch({ viewerUserId, roomId });
      }
      try {
        const res = await fetch(communityMessengerRoomResourcePath(roomId), {
          ...communityMessengerMarkReadFetchInitBase,
          body: JSON.stringify(buildCommunityMessengerMarkReadPatchBody()),
        });
        const parsed = await parseCommunityMessengerMarkReadResponse(res);
        if (!parsed.okHttp || parsed.json.ok !== true) {
          if (viewerUserId && preUnread > 0) {
            applyDomainTradeListUnreadOnlyPatch({
              viewerUserId,
              roomId,
              unreadCount: preUnread,
              mutationType: "PARTICIPANT_UNREAD",
            });
          }
          setActionError(parsed.json.error ?? "room_read_failed");
        }
      } catch {
        if (viewerUserId && preUnread > 0) {
          applyDomainTradeListUnreadOnlyPatch({
            viewerUserId,
            roomId,
            unreadCount: preUnread,
            mutationType: "PARTICIPANT_UNREAD",
          });
        }
        setActionError("room_read_failed");
      } finally {
        setBusyId(null);
      }
    },
    [dto?.viewerUserId]
  );

  const toggleRoomArchive = useCallback(
    async (room: CommunityMessengerRoomSummary) => {
      const roomId = room.id.trim();
      if (!roomId) return;
      const viewerUserId = getSyncViewerUserIdForClient() ?? dto?.viewerUserId ?? "";
      setBusyId(`room-archive:${roomId}`);
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
    return getSwipeLeaveConfirmI18nKey(
      toMessengerPolicyRoomType({
        roomType: leaveConfirmRoom.roomType,
        contextMeta: leaveConfirmRoom.contextMeta ?? null,
      })
    );
  }, [leaveConfirmRoom]);

  const executeLeaveMessengerRoom = useCallback(async () => {
    const room = leaveConfirmRoom;
    if (!room) return;
    setLeaveConfirmRoom(null);
    const roomId = room.id.trim();
    const viewerUserId = getSyncViewerUserIdForClient() ?? dto?.viewerUserId ?? "";
    setBusyId(`room-leave:${roomId}`);
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

  if (mode === "loading" && !dto) {
    return (
      <div
        className="flex h-full min-h-0 flex-col bg-sam-app"
        data-domain-trade-list="loading"
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
        data-domain-trade-list="error"
        data-domain-list-mode="domain"
      >
        {reason ? <div className="sr-only" data-domain-trade-error={reason} /> : null}
        {!tabletSplitListOnly ? (
          <div className="border-b border-sam-border px-4 py-3">
            <div className="text-base font-semibold text-sam-fg">{title}</div>
          </div>
        ) : null}
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 px-4 text-sm text-sam-muted">
          <p>{language === "en" ? "Couldn’t load trade chats." : "거래 채팅을 불러오지 못했습니다."}</p>
          <button
            type="button"
            className="rounded-md bg-sam-primary px-3 py-1.5 text-xs text-white"
            onClick={() => {
              setMode("loading");
              setReason(null);
              window.location.reload();
            }}
          >
            {language === "en" ? "Retry" : "다시 시도"}
          </button>
        </div>
      </div>
    );
  }

  if (!dto) return null;

  return (
    <div
      className="flex h-full min-h-0 flex-col bg-sam-app"
      data-domain-trade-list="1"
      data-domain-list-mode="domain"
      data-domain-trade-list-swipe="canonical"
      data-domain-unread-rooms={String(unreadRoomCount)}
      data-trade-role-filter={roleFilter}
      data-tablet-split={tabletSplitListOnly ? "1" : "0"}
    >
      <div className="border-b border-sam-border px-4 py-3">
        {!tabletSplitListOnly ? (
          <>
            <div className="text-base font-semibold text-sam-fg">{title}</div>
            {unreadRoomCount > 0 ? (
              <div className="text-xs text-sam-muted">
                {language === "en" ? `${unreadRoomCount} unread` : `읽지 않음 ${unreadRoomCount}`}
              </div>
            ) : null}
          </>
        ) : null}
        <div
          className={!tabletSplitListOnly ? "mt-2 flex gap-1.5" : "flex gap-1.5"}
          role="tablist"
          aria-label={t("cm_trade_chat_filter_all")}
        >
          {ROLE_FILTERS.map((id) => {
            const active = roleFilter === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                className={
                  active
                    ? "rounded-full bg-sam-primary px-3 py-1 text-xs text-white"
                    : "rounded-full bg-sam-muted/15 px-3 py-1 text-xs text-sam-fg"
                }
                onClick={() => setRoleFilter(id)}
              >
                {filterLabel(id)}
              </button>
            );
          })}
        </div>
        {actionError ? (
          <div className="mt-2 text-xs text-red-600" data-domain-trade-action-error="1">
            {actionError}
          </div>
        ) : null}
      </div>
      <div
        className={`min-h-0 flex-1 overflow-y-auto ${listScrollInsetClass}`}
        data-messenger-hub-list-scroll=""
        data-cm-list-scroll-bottom-inset={bottomNavOccupiesClearance ? "1" : "0"}
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
        <MobileConfirmBottomSheet
          open
          onCancel={() => setLeaveConfirmRoom(null)}
          title={t("cm_ui_leave_chat_room")}
          description={t(leaveConfirmI18nKey)}
          cancelLabel={t("common_cancel")}
          confirmLabel={t("cm_ui_leave")}
          confirmTone="danger"
          onConfirm={() => {
            void executeLeaveMessengerRoom();
          }}
          zIndexClass="z-[70]"
          ariaLabel={t("cm_ui_leave_confirm_aria")}
          interactionMode="blocking"
        />
      ) : null}
    </div>
  );
}
