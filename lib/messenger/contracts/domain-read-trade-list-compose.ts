/**
 * Trade List Read Surface DTO (Domain Read Canary).
 */
import { createClient } from "@supabase/supabase-js";
import { createTradeLiveBootstrapSource } from "@/lib/messenger/contracts/phase11b-live-domain-loaders";
import {
  assertDomainReadSurfaceWritersOff,
  killDomainReadBundle,
} from "@/lib/messenger/contracts/domain-read-surface-canary";
import { selectLatestRowByActivityAt } from "@/lib/messenger/contracts/latest-activity-selector";
import { runTradeBootstrap } from "@/lib/messenger/trade/phase6-bootstrap";
import { buildTradeHubViewModel } from "@/lib/messenger/trade/hub";
import { buildTradeListViewModel, tradeStatusBadgeSeparated } from "@/lib/messenger/trade/row-model";
import { TRADE_DOMAIN } from "@/lib/messenger/trade/domain";

export type DomainReadTradeListDto = Readonly<{
  authority: "domain_trade_list_canary";
  viewerUserId: string;
  producedAt: string;
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
    chatDomain: typeof TRADE_DOMAIN;
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
  writers: {
    cache: false;
    realtime: false;
    badge: false;
    notification: false;
    atomic: false;
  };
}>;

export type DomainReadTradeListComposeResult =
  | { ok: true; dto: DomainReadTradeListDto }
  | { ok: false; trigger: string; error?: string };

export function validateDomainReadTradeListDto(
  dto: DomainReadTradeListDto
): { ok: true } | { ok: false; trigger: string } {
  if (dto.authority !== "domain_trade_list_canary") {
    return { ok: false, trigger: "invalid_authority" };
  }
  const ids = new Set<string>();
  const keys = new Set<string>();
  for (const row of dto.rows) {
    if (row.chatDomain !== TRADE_DOMAIN) return { ok: false, trigger: "foreign_domain_row" };
    if (!row.roomId || !row.domainIdentityKey || !row.itemId) {
      return { ok: false, trigger: "trade_identity_missing" };
    }
    if (!row.productTitle.trim()) return { ok: false, trigger: "product_identity_missing" };
    if (ids.has(row.roomId)) return { ok: false, trigger: "duplicate_room_id" };
    if (keys.has(row.domainIdentityKey)) return { ok: false, trigger: "duplicate_identity" };
    ids.add(row.roomId);
    keys.add(row.domainIdentityKey);
  }
  if (dto.hub.roomCount !== dto.rows.length) return { ok: false, trigger: "hub_count_mismatch" };
  if (dto.rows.length === 0) {
    if (dto.hub.latestRoomId != null) return { ok: false, trigger: "trade_hub_latest_mismatch" };
  } else if (dto.hub.latestRoomId == null) {
    return { ok: false, trigger: "trade_hub_latest_mismatch" };
  } else {
    const hit = dto.rows.find((r) => r.roomId === dto.hub.latestRoomId);
    if (!hit) return { ok: false, trigger: "trade_hub_latest_mismatch" };
    if (hit.previewText !== dto.hub.previewText) {
      return { ok: false, trigger: "hub_preview_mismatch" };
    }
  }
  if (dto.writers.cache || dto.writers.realtime || dto.writers.badge) {
    return { ok: false, trigger: "writer_layer_on" };
  }
  return { ok: true };
}

export async function composeDomainReadTradeListDto(
  viewerUserId: string
): Promise<DomainReadTradeListComposeResult> {
  try {
    assertDomainReadSurfaceWritersOff();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!url || !key) return { ok: false, trigger: "supabase_env_missing" };

    const sb = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const trade = await runTradeBootstrap({
      viewerUserId,
      generation: `trade-list-${Date.now()}`,
      snapshotKind: "full",
      source: createTradeLiveBootstrapSource(sb),
    });
    if (trade.viewerUserId !== viewerUserId) {
      return { ok: false, trigger: "viewer_mismatch" };
    }

    const hub = buildTradeHubViewModel(trade.rows);
    const latest = selectLatestRowByActivityAt(trade.rows, (r) => ({
      activityAt: r.lastMessageAt,
      tieKey: r.roomId,
    }));
    if ((latest?.roomId ?? null) !== hub.latestRoomId) {
      killDomainReadBundle("trade", "trade_hub_latest_mismatch");
      return { ok: false, trigger: "trade_hub_latest_mismatch" };
    }

    const vms = trade.rows.map(buildTradeListViewModel);
    const sorted = [...vms].sort((a, b) => {
      const ta = Date.parse(a.lastMessageAt) || 0;
      const tb = Date.parse(b.lastMessageAt) || 0;
      if (tb !== ta) return tb - ta;
      return a.roomId < b.roomId ? -1 : a.roomId > b.roomId ? 1 : 0;
    });
    const byId = new Map(trade.rows.map((r) => [r.roomId, r]));

    const dto: DomainReadTradeListDto = {
      authority: "domain_trade_list_canary",
      viewerUserId,
      producedAt: new Date().toISOString(),
      hub: {
        roomCount: hub.roomCount,
        unreadRoomCount: hub.unreadCount,
        latestRoomId: hub.latestRoomId,
        latestActivityAt: hub.lastEventAt,
        previewText: hub.previewText,
        latestDomainIdentityKey: hub.latestDomainIdentityKey,
      },
      rows: sorted.map((vm) => ({
        roomId: vm.roomId,
        chatDomain: TRADE_DOMAIN,
        domainIdentityKey: vm.domainIdentityKey,
        itemId: vm.itemId,
        productTitle: vm.productTitle,
        productImageUrl: vm.productImageUrl,
        peerLabel: vm.peerLabel,
        previewText: vm.previewText,
        statusBadge: tradeStatusBadgeSeparated(byId.get(vm.roomId)!) ?? null,
        unreadCount: vm.unreadCount,
        lastMessageAt: vm.lastMessageAt,
        href: vm.href,
      })),
      writers: {
        cache: false,
        realtime: false,
        badge: false,
        notification: false,
        atomic: false,
      },
    };

    const guard = validateDomainReadTradeListDto(dto);
    if (!guard.ok) {
      killDomainReadBundle("trade", guard.trigger);
      return { ok: false, trigger: guard.trigger };
    }
    return { ok: true, dto };
  } catch (e) {
    killDomainReadBundle("trade", "runtime_exception");
    return {
      ok: false,
      trigger: "runtime_exception",
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
