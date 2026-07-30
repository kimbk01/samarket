"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import {
  isClientBundleKilled,
  isDomainShellReadUiCanaryViewer,
} from "@/components/community-messenger/domain-shell-canary/canary-allowlist";
import { TradeDomainShellRow } from "@/components/community-messenger/domain-shell-canary/TradeDomainShellRow";
import { markRoomEntryIntent } from "@/lib/community-messenger/room/messenger-room-entry-intent";
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
import { subscribeDomainListCanaryPatch } from "@/components/community-messenger/domain-shell-canary/domain-list-canary-realtime-patch";
import {
  filterTradeListRowsByRole,
  type TradeListRoleFilter,
} from "@/lib/messenger/trade/list-sort-filter";
import { MESSENGER_HUB_LIST_SCROLL_BOTTOM_INSET_CLASS } from "@/lib/layout/main-bottom-nav-hub-clearance";
import { useBottomNavOccupiesClearance } from "@/lib/layout/bottom-nav-scroll-chrome-context";

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

/**
 * Trade Hub→List — Domain Facts only. Production surface (no Legacy home rollback).
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

  const filterLabel = (id: TradeListRoleFilter) => {
    if (id === "all") {
      return safeT("cm_trade_chat_filter_all", { fallbackKo: "전체", fallbackEn: "All" });
    }
    if (id === "selling") {
      return safeT("cm_trade_chat_filter_selling", { fallbackKo: "판매", fallbackEn: "Selling" });
    }
    return safeT("cm_trade_chat_filter_buying", { fallbackKo: "구매", fallbackEn: "Buying" });
  };

  const roleLabelFor = (role: "seller" | "buyer") =>
    role === "seller"
      ? safeT("cm_trade_chat_role_sale", { fallbackKo: "판매", fallbackEn: "Selling" })
      : safeT("cm_trade_chat_role_purchase", { fallbackKo: "구매", fallbackEn: "Buying" });

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
      </div>
      <div
        className={`min-h-0 flex-1 overflow-y-auto ${listScrollInsetClass}`}
        data-messenger-hub-list-scroll=""
        data-cm-list-scroll-bottom-inset={bottomNavOccupiesClearance ? "1" : "0"}
      >
        {visibleRows.map((row) => (
          <TradeDomainShellRow
            key={row.roomId}
            href={row.href}
            productTitle={row.productTitle}
            productImageUrl={row.productImageUrl}
            peerLabel={row.peerLabel?.trim() || (language === "en" ? "Counterpart" : "상대방")}
            peerAvatarUrl={row.peerAvatarUrl ?? null}
            roleLabel={roleLabelFor(row.viewerRole!)}
            statusBadge={row.statusBadge}
            preview={row.previewText || (language === "en" ? "No messages" : "메시지가 없습니다")}
            previewIsSystemEvent={row.previewIsSystemEvent === true}
            unreadCount={row.unreadCount}
            lastMessageAt={row.lastMessageAt}
            onNavigate={() =>
              markRoomEntryIntent(row.roomId, {
                title: row.peerLabel?.trim() || row.productTitle,
                avatarUrl: row.peerAvatarUrl || row.productImageUrl || null,
                expectedDomain: "trade",
                expectedIdentityKey: row.domainIdentityKey,
              })
            }
          />
        ))}
      </div>
    </div>
  );
}
