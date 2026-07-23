/**
 * Store Order Customer List Read Surface DTO (Domain Read Canary).
 * Owner surface is intentionally excluded.
 */
import { createClient } from "@supabase/supabase-js";
import { createStoreOrderCustomerLiveBootstrapSource } from "@/lib/messenger/contracts/phase11b-live-domain-loaders";
import {
  assertDomainReadSurfaceWritersOff,
  killDomainReadBundle,
} from "@/lib/messenger/contracts/domain-read-surface-canary";
import { selectLatestRowByActivityAt } from "@/lib/messenger/contracts/latest-activity-selector";
import { runStoreOrderBootstrap } from "@/lib/messenger/store-order/phase6-bootstrap";
import { buildStoreOrderHubViewModel } from "@/lib/messenger/store-order/hub";
import { buildStoreOrderCustomerListViewModel } from "@/lib/messenger/store-order/row-model";
import { STORE_ORDER_DOMAIN } from "@/lib/messenger/store-order/design-lock";
import { resolveDomainReadRequestLanguage } from "@/lib/messenger/contracts/domain-read-request-language";

export type DomainReadStoreOrderCustomerListDto = Readonly<{
  authority: "domain_store_order_customer_list_canary";
  viewerUserId: string;
  producedAt: string;
  surfaceRole: "customer";
  hub: {
    roomCount: number;
    unreadRoomCount: number;
    latestRoomId: string | null;
    latestActivityAt: string | null;
    previewText: string;
    latestDomainIdentityKey: string | null;
  };
  rows: ReadonlyArray<{
    roomId: string;
    chatDomain: typeof STORE_ORDER_DOMAIN;
    domainIdentityKey: string;
    orderId: string;
    storeId: string | null;
    storeName: string;
    storeImageUrl: string | null;
    previewText: string;
    statusBadge: string | null;
    unreadCount: number;
    lastMessageAt: string;
    href: string;
    exposesMemberIdentity: false;
  }>;
  writers: {
    cache: false;
    realtime: false;
    badge: false;
    notification: false;
    atomic: false;
  };
}>;

export type DomainReadStoreOrderCustomerListComposeResult =
  | { ok: true; dto: DomainReadStoreOrderCustomerListDto }
  | { ok: false; trigger: string; error?: string };

function looksLikeMemberHandle(name: string): boolean {
  return name.trim().startsWith("@");
}

export function validateDomainReadStoreOrderCustomerListDto(
  dto: DomainReadStoreOrderCustomerListDto
): { ok: true } | { ok: false; trigger: string } {
  if (dto.authority !== "domain_store_order_customer_list_canary") {
    return { ok: false, trigger: "invalid_authority" };
  }
  if (dto.surfaceRole !== "customer") return { ok: false, trigger: "owner_surface_leak" };
  const roomIds = new Set<string>();
  const orderIds = new Set<string>();
  const keys = new Set<string>();
  for (const row of dto.rows) {
    if (row.chatDomain !== STORE_ORDER_DOMAIN) return { ok: false, trigger: "foreign_domain_row" };
    if (row.exposesMemberIdentity !== false) {
      return { ok: false, trigger: "store_order_member_identity" };
    }
    if (!row.orderId || !row.roomId || !row.domainIdentityKey) {
      return { ok: false, trigger: "order_identity_missing" };
    }
    if (!row.storeName.trim()) return { ok: false, trigger: "store_identity_missing" };
    if (looksLikeMemberHandle(row.storeName)) {
      return { ok: false, trigger: "member_handle_as_store_name" };
    }
    if (roomIds.has(row.roomId)) return { ok: false, trigger: "duplicate_room_id" };
    if (orderIds.has(row.orderId)) return { ok: false, trigger: "duplicate_order_id" };
    if (keys.has(row.domainIdentityKey)) return { ok: false, trigger: "duplicate_identity" };
    roomIds.add(row.roomId);
    orderIds.add(row.orderId);
    keys.add(row.domainIdentityKey);
  }
  if (dto.hub.roomCount !== dto.rows.length) return { ok: false, trigger: "hub_count_mismatch" };
  if (dto.rows.length === 0) {
    if (dto.hub.latestRoomId != null) return { ok: false, trigger: "store_order_hub_latest_mismatch" };
  } else {
    const hit = dto.rows.find((r) => r.roomId === dto.hub.latestRoomId);
    if (!hit) return { ok: false, trigger: "store_order_hub_latest_mismatch" };
    if (hit.previewText !== dto.hub.previewText) {
      return { ok: false, trigger: "hub_preview_mismatch" };
    }
  }
  if (dto.writers.cache || dto.writers.realtime || dto.writers.badge) {
    return { ok: false, trigger: "writer_layer_on" };
  }
  return { ok: true };
}

export async function composeDomainReadStoreOrderCustomerListDto(
  viewerUserId: string
): Promise<DomainReadStoreOrderCustomerListComposeResult> {
  try {
    assertDomainReadSurfaceWritersOff();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!url || !key) return { ok: false, trigger: "supabase_env_missing" };

    const sb = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const so = await runStoreOrderBootstrap({
      viewerUserId,
      generation: `so-cust-list-${Date.now()}`,
      snapshotKind: "full",
      surfaceRole: "customer",
      source: createStoreOrderCustomerLiveBootstrapSource(sb),
    });
    if (so.viewerUserId !== viewerUserId) {
      return { ok: false, trigger: "viewer_mismatch" };
    }

    const hub = buildStoreOrderHubViewModel(so.rows);
    const latest = selectLatestRowByActivityAt(so.rows, (r) => ({
      activityAt: r.latestChatMessageAt,
      tieKey: r.roomId,
    }));
    if ((latest?.roomId ?? null) !== hub.latestRoomId) {
      killDomainReadBundle("store_order_customer", "store_order_hub_latest_mismatch");
      return { ok: false, trigger: "store_order_hub_latest_mismatch" };
    }

    const lang = await resolveDomainReadRequestLanguage();
    const vms = so.rows.map((row) => buildStoreOrderCustomerListViewModel(row, lang));
    const sorted = [...vms].sort((a, b) => {
      const ta = Date.parse(a.lastMessageAt) || 0;
      const tb = Date.parse(b.lastMessageAt) || 0;
      if (tb !== ta) return tb - ta;
      return a.roomId < b.roomId ? -1 : a.roomId > b.roomId ? 1 : 0;
    });
    const byId = new Map(so.rows.map((r) => [r.roomId, r]));

    const dto: DomainReadStoreOrderCustomerListDto = {
      authority: "domain_store_order_customer_list_canary",
      viewerUserId,
      producedAt: new Date().toISOString(),
      surfaceRole: "customer",
      hub: {
        roomCount: hub.roomCount,
        unreadRoomCount: hub.unreadCount,
        latestRoomId: hub.latestRoomId,
        latestActivityAt: hub.lastEventAt,
        previewText: hub.previewText,
        latestDomainIdentityKey: hub.latestDomainIdentityKey,
      },
      rows: sorted.map((vm) => {
        const raw = byId.get(vm.roomId);
        return {
          roomId: vm.roomId,
          chatDomain: STORE_ORDER_DOMAIN,
          domainIdentityKey: vm.domainIdentityKey,
          orderId: vm.orderId,
          storeId: raw?.storeId ?? null,
          storeName: vm.storeName,
          storeImageUrl: vm.storeImageUrl,
          previewText: vm.previewText,
          statusBadge: vm.statusBadge,
          unreadCount: vm.unreadCount,
          lastMessageAt: vm.lastMessageAt,
          href: vm.href,
          exposesMemberIdentity: false as const,
        };
      }),
      writers: {
        cache: false,
        realtime: false,
        badge: false,
        notification: false,
        atomic: false,
      },
    };

    const guard = validateDomainReadStoreOrderCustomerListDto(dto);
    if (!guard.ok) {
      killDomainReadBundle("store_order_customer", guard.trigger);
      return { ok: false, trigger: guard.trigger };
    }
    return { ok: true, dto };
  } catch (e) {
    killDomainReadBundle("store_order_customer", "runtime_exception");
    return {
      ok: false,
      trigger: "runtime_exception",
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
