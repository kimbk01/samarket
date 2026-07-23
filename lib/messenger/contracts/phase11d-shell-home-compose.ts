/**
 * Domain Shell Home DTO compose (server).
 * Allowlist Domain Bootstrap → Domain Cache seed → DTO.
 * Domain Authority writers reported from PHASE11D_A_* CONNECTED flags.
 */
import { createClient } from "@supabase/supabase-js";
import {
  createGeneralDirectLiveBootstrapSource,
  createGroupLiveBootstrapSource,
  createTradeLiveBootstrapSource,
  createStoreOrderCustomerLiveBootstrapSource,
} from "@/lib/messenger/contracts/phase11b-live-domain-loaders";
import {
  assertPhase11dShellReadUiWritersOff,
  type Phase11dShellHomeDto,
  validatePhase11dShellHomeDto,
} from "@/lib/messenger/contracts/phase11d-shell-read-ui-canary";
import {
  isDomainCacheAuthorityEnabledForViewer,
  seedDomainCacheAuthoritySnapshot,
} from "@/lib/messenger/contracts/domain-cache-authority";
import { readDomainBadgeAuthorityShell } from "@/lib/messenger/contracts/domain-badge-authority";
import { isDomainRealtimeAuthorityEnabledForViewer } from "@/lib/messenger/contracts/domain-realtime-authority";
import { isDomainBadgeAuthorityEnabledForViewer } from "@/lib/messenger/contracts/domain-badge-authority";
import { isDomainNotificationAuthorityEnabledForViewer } from "@/lib/messenger/contracts/domain-notification-authority";
import { isDomainAtomicReadAuthorityEnabledForViewer } from "@/lib/messenger/contracts/domain-atomic-read-authority";
import { runGeneralDirectBootstrap } from "@/lib/messenger/general-direct/phase6-bootstrap";
import { runGroupBootstrap } from "@/lib/messenger/group/phase6-bootstrap";
import { runTradeBootstrap } from "@/lib/messenger/trade/phase6-bootstrap";
import { runStoreOrderBootstrap } from "@/lib/messenger/store-order/phase6-bootstrap";
import { buildGeneralDirectRowModel } from "@/lib/messenger/general-direct/row-model";
import { buildGroupRowModel } from "@/lib/messenger/group/row-model";
import { buildTradeHubViewModel } from "@/lib/messenger/trade/hub";
import { buildStoreOrderHubViewModel } from "@/lib/messenger/store-order/hub";
import { composePhase10ShellFinal } from "@/lib/messenger/shell/phase10-final-compose";
import { buildGeneralDirectUnreadContribution } from "@/lib/messenger/general-direct/phase8a-read-unread-badge";
import { buildGroupUnreadContribution } from "@/lib/messenger/group/phase8a-read-unread-badge";
import { buildTradeUnreadContribution } from "@/lib/messenger/trade/phase8a-read-unread-badge";
import { buildStoreOrderUnreadContribution } from "@/lib/messenger/store-order/phase8a-read-unread-badge";
import type { OrderStatusContributionPhase8b } from "@/lib/messenger/contracts/delivery-nav-aggregator-phase8b";
import { selectLatestRowByActivityAt } from "@/lib/messenger/contracts/latest-activity-selector";

function emptyOrderStatus(viewerUserId: string): OrderStatusContributionPhase8b {
  return {
    kind: "order_status",
    viewerUserId,
    surfaceRole: "customer",
    storeId: null,
    actionableOrderIdentityKeys: [],
    generation: 0,
    computedAt: new Date().toISOString(),
  };
}

function phase8aOrderStatus(viewerUserId: string) {
  return {
    kind: "order_status" as const,
    viewerUserId,
    orderStatusCount: 0,
    actionableOrderIdentityKeys: [] as string[],
    generation: 0,
    computedAt: new Date().toISOString(),
  };
}

export type Phase11dShellHomeComposeResult =
  | { ok: true; dto: Phase11dShellHomeDto }
  | { ok: false; trigger: string; error?: string };

export async function composePhase11dShellHomeDto(
  viewerUserId: string
): Promise<Phase11dShellHomeComposeResult> {
  try {
    assertPhase11dShellReadUiWritersOff();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!url || !key) {
      return { ok: false, trigger: "supabase_env_missing" };
    }
    const sb = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const generation = `shell-ui-${Date.now()}`;

    const [gd, group, trade, so] = await Promise.all([
      runGeneralDirectBootstrap({
        viewerUserId,
        generation,
        snapshotKind: "full",
        source: createGeneralDirectLiveBootstrapSource(sb),
      }),
      runGroupBootstrap({
        viewerUserId,
        generation,
        snapshotKind: "full",
        source: createGroupLiveBootstrapSource(sb),
      }),
      runTradeBootstrap({
        viewerUserId,
        generation,
        snapshotKind: "full",
        source: createTradeLiveBootstrapSource(sb),
      }),
      runStoreOrderBootstrap({
        viewerUserId,
        generation,
        snapshotKind: "full",
        surfaceRole: "customer",
        source: createStoreOrderCustomerLiveBootstrapSource(sb),
      }),
    ]);

    if (gd.viewerUserId !== viewerUserId) {
      return { ok: false, trigger: "viewer_mismatch" };
    }

    // STEP2 Domain Cache Authority seed (allowlist only) — hydrate key matches seed key.
    if (isDomainCacheAuthorityEnabledForViewer(viewerUserId)) {
      seedDomainCacheAuthoritySnapshot({
        domain: "general_direct",
        viewerUserId,
        generation,
        producedAt: gd.producedAt,
        rows: gd.rows,
      });
      seedDomainCacheAuthoritySnapshot({
        domain: "group",
        viewerUserId,
        generation,
        producedAt: group.producedAt,
        rows: group.rows,
      });
      seedDomainCacheAuthoritySnapshot({
        domain: "trade",
        viewerUserId,
        generation,
        producedAt: trade.producedAt,
        rows: trade.rows,
      });
      seedDomainCacheAuthoritySnapshot({
        domain: "store_order",
        viewerUserId,
        generation,
        producedAt: so.producedAt,
        rows: so.rows,
        surfaceRole: "customer",
      });
    }

    const gdVms = gd.rows.map(buildGeneralDirectRowModel);
    const gVms = group.rows.map(buildGroupRowModel);
    const trHub = buildTradeHubViewModel(trade.rows);
    const soHub = buildStoreOrderHubViewModel(so.rows);

    // Hub latest must match latest row from same snapshot (rollback if not)
    const tradeLatest = selectLatestRowByActivityAt(trade.rows, (r) => ({
      activityAt: r.lastMessageAt,
      tieKey: r.roomId,
    }));
    if ((tradeLatest?.roomId ?? null) !== trHub.latestRoomId) {
      return { ok: false, trigger: "trade_hub_latest_mismatch" };
    }
    const soLatest = selectLatestRowByActivityAt(so.rows, (r) => ({
      activityAt: r.latestChatMessageAt,
      tieKey: r.roomId,
    }));
    if ((soLatest?.roomId ?? null) !== soHub.latestRoomId) {
      return { ok: false, trigger: "store_order_hub_latest_mismatch" };
    }

    const gdUnread = buildGeneralDirectUnreadContribution({
      viewerUserId,
      rows: gd.rows,
      generation: 1,
    });
    const groupUnread = buildGroupUnreadContribution({
      viewerUserId,
      rows: group.rows,
      generation: 1,
    });
    const tradeUnread = buildTradeUnreadContribution({
      viewerUserId,
      rows: trade.rows,
      generation: 1,
    });
    const soUnread = buildStoreOrderUnreadContribution({
      viewerUserId,
      surfaceRole: "customer",
      storeId: null,
      rows: so.rows,
      generation: 1,
    });
    const orderStatus = emptyOrderStatus(viewerUserId);
    const phase8aInput = {
      generalDirect: gdUnread,
      group: groupUnread,
      trade: tradeUnread,
      storeOrder: soUnread,
      orderStatus: phase8aOrderStatus(viewerUserId),
    };
    // Domain Badge Authority product read (allowlist) — include shell in DTO for UI + nav publish.
    const badgeRead = readDomainBadgeAuthorityShell({
      viewerUserId,
      counts: {
        general_direct: gdUnread.unreadRoomCount,
        group: groupUnread.unreadRoomCount,
        trade: tradeUnread.unreadRoomCount,
        store_order: soUnread.unreadRoomCount,
      },
      phase8a: phase8aInput,
    });
    const badge =
      badgeRead.status === "ok"
        ? {
            messenger: badgeRead.shell.communityMessengerUnread,
            trade: badgeRead.shell.tradeUnread,
            storeOrder: badgeRead.shell.storeOrderChatUnread,
            authority: "domain_badge" as const,
          }
        : null;

    const shell = composePhase10ShellFinal({
      home: {
        generalDirectRows: gdVms,
        groupRows: gVms,
        tradeHub: trHub,
        storeOrderHub: soHub,
      },
      badge: {
        generalDirect: gdUnread,
        group: groupUnread,
        trade: tradeUnread,
        storeOrder: soUnread,
        orderStatus,
      },
      appIconNotificationEvents: [],
    });

    for (const entry of shell.home.inboxRows) {
      if (entry.domain !== "general_direct" && entry.domain !== "group") {
        return { ok: false, trigger: "trade_or_store_order_in_inbox" };
      }
    }

    const inbox = shell.home.inboxRows.map((entry) => {
      if (entry.domain === "general_direct") {
        const full = gdVms.find((r) => r.roomId === entry.row.roomId);
        return {
          domain: "general_direct" as const,
          roomId: entry.row.roomId,
          domainIdentityKey: full?.domainIdentityKey ?? "",
          title: entry.row.title,
          avatarUrl: entry.row.avatarUrl,
          previewText: entry.row.previewText,
          lastMessageAt: entry.row.lastMessageAt,
          unreadCount: entry.row.unreadCount,
          href: entry.row.href,
        };
      }
      const full = gVms.find((r) => r.roomId === entry.row.roomId);
      return {
        domain: "group" as const,
        roomId: entry.row.roomId,
        domainIdentityKey: full?.domainIdentityKey ?? "",
        title: entry.row.title,
        avatarUrl: entry.row.avatarUrl,
        previewText: entry.row.previewText,
        lastMessageAt: entry.row.lastMessageAt,
        unreadCount: entry.row.unreadCount,
        href: entry.row.href,
        groupId: entry.row.groupId,
        memberCount: entry.row.memberCount,
      };
    });

    const dto: Phase11dShellHomeDto = {
      authority: "domain_shell_read_ui_canary",
      viewerUserId,
      producedAt: new Date().toISOString(),
      inbox,
      tradeHub: {
        domain: "trade",
        roomCount: trHub.roomCount,
        unreadRoomCount: trHub.unreadCount,
        latestRoomId: trHub.latestRoomId,
        latestActivityAt: trHub.lastEventAt,
        previewText: trHub.previewText,
        href: trHub.hrefToTradeList,
      },
      storeOrderHub: {
        domain: "store_order",
        roomCount: soHub.roomCount,
        unreadRoomCount: soHub.unreadCount,
        latestRoomId: soHub.latestRoomId,
        latestActivityAt: soHub.lastEventAt,
        previewText: soHub.previewText,
        href: soHub.hrefToOrderList,
        exposesMemberIdentity: false,
      },
      counts: {
        generalDirect: gdVms.length,
        group: gVms.length,
      },
      writers: {
        cache: isDomainCacheAuthorityEnabledForViewer(viewerUserId),
        realtime: isDomainRealtimeAuthorityEnabledForViewer(viewerUserId),
        badge: isDomainBadgeAuthorityEnabledForViewer(viewerUserId),
        notification: isDomainNotificationAuthorityEnabledForViewer(viewerUserId),
        atomic: isDomainAtomicReadAuthorityEnabledForViewer(viewerUserId),
      },
      badge,
    };

    const guard = validatePhase11dShellHomeDto(dto, null);
    if (!guard.ok) {
      return { ok: false, trigger: guard.trigger };
    }
    return { ok: true, dto };
  } catch (e) {
    return {
      ok: false,
      trigger: "runtime_exception",
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
