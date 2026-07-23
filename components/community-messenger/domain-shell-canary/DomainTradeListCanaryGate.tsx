"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import {
  isClientBundleKilled,
  isDomainShellReadUiCanaryViewer,
} from "@/components/community-messenger/domain-shell-canary/canary-allowlist";
import {
  DomainCanaryShellRow,
  formatDomainCanaryTime,
} from "@/components/community-messenger/domain-shell-canary/DomainCanaryShellRow";
import { markRoomEntryIntent } from "@/lib/community-messenger/room/messenger-room-entry-intent";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  fetchDomainListCanaryWithRetry,
  logDomainListCanaryLegacyFallback,
} from "@/components/community-messenger/domain-shell-canary/domain-list-canary-retry";
import { getSyncViewerUserIdForClient } from "@/lib/auth/get-current-user";
import {
  isDomainTradeListCanaryCacheFresh,
  peekDomainTradeListCanaryCache,
  primeDomainTradeListCanaryCache,
} from "@/components/community-messenger/domain-shell-canary/domain-trade-list-canary-cache";
import {
  domainTradeListPaintEqual,
  stabilizeTradeListDto,
} from "@/components/community-messenger/domain-shell-canary/domain-list-canary-stabilize";
import { subscribeDomainListCanaryPatch } from "@/components/community-messenger/domain-shell-canary/domain-list-canary-realtime-patch";

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
    productTitle: string;
    productImageUrl: string | null;
    peerLabel: string | null;
    previewText: string;
    statusBadge: string | null;
    unreadCount: number;
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

/**
 * Trade Hub→List — Domain Facts only. Production surface (no Legacy home rollback).
 * Cache/seed paints immediately; refresh merges in background.
 */
export function DomainTradeListCanaryGate({
  tabletSplitListOnly,
  filter: _filter,
}: {
  tabletSplitListOnly?: boolean;
  filter?: string;
}) {
  const [{ mode: initialMode, dto: initialDto }] = useState(() => {
    const syncUid = getSyncViewerUserIdForClient() ?? null;
    const cached = peekDomainTradeListCanaryCache(syncUid);
    if (cached) return { mode: "ready" as const, dto: cached };
    return { mode: "loading" as const, dto: null };
  });
  const hadCacheOnMountRef = useRef(initialMode === "ready");

  const [mode, setMode] = useState<"loading" | "ready" | "error">(initialMode);
  const [dto, setDto] = useState<TradeListDto | null>(initialDto);
  const [reason, setReason] = useState<string | null>(null);
  const { language } = useI18n();

  /**
   * 2026-07-23: realtime message/read patch가 세션 캐시에 적용될 때 이 화면이 마운트돼 있으면
   * 즉시 반영 — 이전엔 마운트 시 1회 fetch 후 고정이라 재진입/새로고침 전까진 안 보였다.
   */
  useEffect(() => {
    const uid = getSyncViewerUserIdForClient() ?? null;
    return subscribeDomainListCanaryPatch("trade", () => {
      const next = peekDomainTradeListCanaryCache(uid);
      if (next) setDto(next);
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
        /**
         * LIST LOCK: room→list remount with fresh session cache — no network rewrite.
         * Realtime patch subscription still updates rows while mounted.
         */
        if (isDomainTradeListCanaryCacheFresh(syncUid)) {
          const cached = peekDomainTradeListCanaryCache(syncUid);
          if (cached && !cancelled) {
            setDto(cached);
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
        const fail = clientValidate(body);
        if (fail) {
          softFail(fail, { retried: fetchResult.retried });
          return;
        }
        if (cancelled) return;
        const stable = stabilizeTradeListDto(body);
        primeDomainTradeListCanaryCache(stable);
        setDto((prev) => (domainTradeListPaintEqual(prev, stable) ? prev : stable));
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

  if (mode === "loading" && !dto) {
    return (
      <div
        className="flex h-full min-h-0 flex-col bg-sam-app"
        data-domain-trade-list="loading"
        data-domain-list-mode="domain"
        data-tablet-split={tabletSplitListOnly ? "1" : "0"}
      >
        <div className="border-b border-sam-border px-4 py-3">
          <div className="text-base font-semibold text-sam-fg">{title}</div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
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
        <div className="border-b border-sam-border px-4 py-3">
          <div className="text-base font-semibold text-sam-fg">{title}</div>
        </div>
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
      data-tablet-split={tabletSplitListOnly ? "1" : "0"}
    >
      <div className="border-b border-sam-border px-4 py-3">
        <div className="text-base font-semibold text-sam-fg">{title}</div>
        {unreadRoomCount > 0 ? (
          <div className="text-xs text-sam-muted">
            {language === "en" ? `${unreadRoomCount} unread` : `읽지 않음 ${unreadRoomCount}`}
          </div>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {dto.rows.map((row) => (
          <DomainCanaryShellRow
            key={row.roomId}
            href={row.href}
            title={row.productTitle}
            subtitle={row.peerLabel ?? undefined}
            preview={row.previewText || (language === "en" ? "No messages" : "메시지가 없습니다")}
            avatarUrl={row.productImageUrl}
            avatarKind="listing"
            statusBadge={row.statusBadge}
            unreadCount={row.unreadCount}
            time={formatDomainCanaryTime(row.lastMessageAt)}
            onNavigate={() =>
              markRoomEntryIntent(row.roomId, {
                title: row.productTitle,
                avatarUrl: row.productImageUrl,
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
