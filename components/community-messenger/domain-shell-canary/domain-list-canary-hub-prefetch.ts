import { getSyncViewerUserIdForClient } from "@/lib/auth/get-current-user";
import { isDomainShellReadUiCanaryViewer } from "@/components/community-messenger/domain-shell-canary/canary-allowlist";
import { fetchDomainListCanaryWithRetry } from "@/components/community-messenger/domain-shell-canary/domain-list-canary-retry";
import {
  peekDomainTradeListCanaryCache,
  primeDomainTradeListCanaryCache,
} from "@/components/community-messenger/domain-shell-canary/domain-trade-list-canary-cache";
import type { TradeListDto } from "@/components/community-messenger/domain-shell-canary/DomainTradeListCanaryGate";
import {
  peekDomainStoreOrderCustomerListCanaryCache,
  primeDomainStoreOrderCustomerListCanaryCache,
  type SoCustomerListDto,
} from "@/components/community-messenger/domain-shell-canary/domain-store-order-customer-list-canary-cache";
import {
  stabilizeSoCustomerListDto,
  stabilizeTradeListDto,
} from "@/components/community-messenger/domain-shell-canary/domain-list-canary-stabilize";

/**
 * Home hub → Domain list 동일 Facts.
 * Prefetch primes the same stabilized DTO the list screens paint from, so pillar
 * preview/latestRoomId match list row[0] (not CM bootstrap summarizePillarItems).
 */

export const DOMAIN_LIST_CANARY_PRIMED_EVENT = "samarket:domain-list-canary-primed";

let tradePrefetchInflight: Promise<void> | null = null;
let soPrefetchInflight: Promise<void> | null = null;

function viewerEligible(): string | null {
  if (typeof window === "undefined") return null;
  const uid = getSyncViewerUserIdForClient()?.trim() ?? null;
  if (!uid || !isDomainShellReadUiCanaryViewer(uid)) return null;
  return uid;
}

export type DomainCommerceHubListPreview = {
  latestRoomId: string | null;
  /** List row title (product / store) */
  title: string;
  /** List row preview body */
  previewText: string;
  lastEventAt: string | null;
};

/** Same top row the Domain trade list shows after stabilize. */
export function peekDomainTradeHubListPreview(): DomainCommerceHubListPreview | null {
  const uid = viewerEligible();
  if (!uid) return null;
  const raw = peekDomainTradeListCanaryCache(uid);
  if (!raw) return null;
  const dto = stabilizeTradeListDto(raw);
  const top = dto.rows[0];
  if (!top) {
    return { latestRoomId: null, title: "", previewText: "", lastEventAt: null };
  }
  return {
    latestRoomId: top.roomId,
    title: (top.productTitle || top.peerLabel || "").trim(),
    previewText: (top.previewText || dto.hub.previewText || "").trim(),
    lastEventAt: top.lastMessageAt?.trim() || null,
  };
}

/** Same top row the Domain store-order customer list shows after stabilize. */
export function peekDomainStoreOrderHubListPreview(): DomainCommerceHubListPreview | null {
  const uid = viewerEligible();
  if (!uid) return null;
  const raw = peekDomainStoreOrderCustomerListCanaryCache(uid);
  if (!raw) return null;
  const dto = stabilizeSoCustomerListDto(raw);
  const top = dto.rows[0];
  if (!top) {
    return { latestRoomId: null, title: "", previewText: "", lastEventAt: null };
  }
  return {
    latestRoomId: top.roomId,
    title: (top.storeName || "").trim(),
    previewText: (top.previewText || dto.hub.previewText || "").trim(),
    lastEventAt: top.lastMessageAt?.trim() || null,
  };
}

export function peekDomainTradeUnreadRoomCount(): number | null {
  const uid = viewerEligible();
  if (!uid) return null;
  const dto = peekDomainTradeListCanaryCache(uid);
  if (!dto) return null;
  return Math.max(0, Math.floor(Number(stabilizeTradeListDto(dto).hub.unreadRoomCount) || 0));
}

export function peekDomainStoreOrderUnreadRoomCount(): number | null {
  const uid = viewerEligible();
  if (!uid) return null;
  const dto = peekDomainStoreOrderCustomerListCanaryCache(uid);
  if (!dto) return null;
  return Math.max(
    0,
    Math.floor(Number(stabilizeSoCustomerListDto(dto).hub.unreadRoomCount) || 0)
  );
}

/** Cache miss only — never overwrite hydrated Domain list canary (Telegram list authority). */
export function prefetchDomainTradeListCanaryForHub(): Promise<void> {
  const uid = viewerEligible();
  if (!uid) return Promise.resolve();
  if (peekDomainTradeListCanaryCache(uid)) return Promise.resolve();
  if (tradePrefetchInflight) return tradePrefetchInflight;
  tradePrefetchInflight = (async () => {
    try {
      const fetchResult = await fetchDomainListCanaryWithRetry(
        "/api/messenger/domain-read/trade-list",
        { cache: "no-store" }
      );
      if (!fetchResult.ok) return;
      const body = (await fetchResult.res.json()) as TradeListDto;
      if (body.viewerUserId !== uid || body.authority !== "domain_trade_list_canary") return;
      const stabilized = stabilizeTradeListDto(body);
      primeDomainTradeListCanaryCache(stabilized);
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent(DOMAIN_LIST_CANARY_PRIMED_EVENT, { detail: { bundle: "trade" } })
        );
      }
    } catch {
      /* best-effort */
    } finally {
      tradePrefetchInflight = null;
    }
  })();
  return tradePrefetchInflight;
}

export function prefetchDomainStoreOrderCustomerListCanaryForHub(): Promise<void> {
  const uid = viewerEligible();
  if (!uid) return Promise.resolve();
  if (peekDomainStoreOrderCustomerListCanaryCache(uid)) return Promise.resolve();
  if (soPrefetchInflight) return soPrefetchInflight;
  soPrefetchInflight = (async () => {
    try {
      const fetchResult = await fetchDomainListCanaryWithRetry(
        "/api/messenger/domain-read/store-order-customer-list",
        { cache: "no-store" }
      );
      if (!fetchResult.ok) return;
      const body = (await fetchResult.res.json()) as SoCustomerListDto;
      if (
        body.viewerUserId !== uid ||
        body.authority !== "domain_store_order_customer_list_canary"
      ) {
        return;
      }
      const stabilized = stabilizeSoCustomerListDto(body);
      primeDomainStoreOrderCustomerListCanaryCache(stabilized);
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent(DOMAIN_LIST_CANARY_PRIMED_EVENT, { detail: { bundle: "store_order" } })
        );
      }
    } catch {
      /* best-effort */
    } finally {
      soPrefetchInflight = null;
    }
  })();
  return soPrefetchInflight;
}

/** Seed Domain commerce list caches on hub enter only when empty. */
export function prefetchDomainCommerceListsForHub(): void {
  void prefetchDomainTradeListCanaryForHub();
  void prefetchDomainStoreOrderCustomerListCanaryForHub();
}
