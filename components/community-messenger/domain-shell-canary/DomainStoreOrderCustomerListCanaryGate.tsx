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
  peekDomainStoreOrderCustomerListCanaryCache,
  primeDomainStoreOrderCustomerListCanaryCache,
  type SoCustomerListDto,
} from "@/components/community-messenger/domain-shell-canary/domain-store-order-customer-list-canary-cache";
import {
  domainSoCustomerListPaintEqual,
  stabilizeSoCustomerListDto,
} from "@/components/community-messenger/domain-shell-canary/domain-list-canary-stabilize";
import { subscribeDomainListCanaryPatch } from "@/components/community-messenger/domain-shell-canary/domain-list-canary-realtime-patch";

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

/**
 * Store Order Customer List — Domain Facts only. Production surface (no Legacy home).
 */
export function DomainStoreOrderCustomerListCanaryGate({
  tabletSplitListOnly,
  filter: _filter,
}: {
  tabletSplitListOnly?: boolean;
  filter?: string;
}) {
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
  const { language } = useI18n();

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
         */
        const cached = peekDomainStoreOrderCustomerListCanaryCache(syncUid);
        if (cached) {
          if (!cancelled) {
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

  const title = language === "en" ? "Order chats" : "주문 채팅";
  const unreadRoomCount = dto?.hub.unreadRoomCount ?? 0;

  if (mode === "loading" && !dto) {
    return (
      <div
        className="flex h-full min-h-0 flex-col bg-sam-app"
        data-domain-so-customer-list="loading"
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
        data-domain-so-customer-list="error"
        data-domain-list-mode="domain"
      >
        {reason ? <div className="sr-only" data-domain-so-customer-error={reason} /> : null}
        <div className="border-b border-sam-border px-4 py-3">
          <div className="text-base font-semibold text-sam-fg">{title}</div>
        </div>
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 px-4 text-sm text-sam-muted">
          <p>{language === "en" ? "Couldn’t load order chats." : "주문 채팅을 불러오지 못했습니다."}</p>
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
      data-domain-so-customer-list="1"
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
            title={row.storeName}
            preview={row.previewText || (language === "en" ? "No messages" : "메시지가 없습니다")}
            avatarUrl={row.storeImageUrl}
            avatarKind="store"
            statusBadge={row.statusBadge}
            unreadCount={row.unreadCount}
            time={formatDomainCanaryTime(row.lastMessageAt)}
            onNavigate={() =>
              markRoomEntryIntent(row.roomId, {
                title: row.storeName,
                avatarUrl: row.storeImageUrl,
                expectedDomain: "store_order",
                expectedIdentityKey: row.domainIdentityKey,
              })
            }
          />
        ))}
      </div>
    </div>
  );
}
