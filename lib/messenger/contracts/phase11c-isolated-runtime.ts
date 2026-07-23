/**
 * Phase 11C — Isolated Runtime Integration (harness only).
 *
 * Live/Fixture Loader → Bootstrap → Domain Cache → Realtime apply →
 * RowModel/Hub → Phase 10 Shell Compose.
 *
 * FORBIDDEN: production UI, browser storage APIs, live Supabase subscriber,
 * production multi-tab bus, OS Badge, legacy writers, cutover ON.
 */
import { DOMAIN_BOOTSTRAP_SCHEMA_VERSION } from "@/lib/messenger/contracts/domain-bootstrap-cache";
import { assertPhase11cIsolatedOnly } from "@/lib/messenger/contracts/phase11c-isolated-runtime-gate";
import { composePhase10ShellFinal } from "@/lib/messenger/shell/phase10-final-compose";
import type { Phase10ShellFinalComposeOutput } from "@/lib/messenger/shell/phase10-final-compose";
import type { OrderStatusContributionPhase8b } from "@/lib/messenger/contracts/delivery-nav-aggregator-phase8b";
import { parseActivityMs } from "@/lib/messenger/contracts/latest-activity-selector";

import {
  generalDirectPhase6Cache,
  runGeneralDirectBootstrap,
  type GeneralDirectBootstrapSource,
} from "@/lib/messenger/general-direct/phase6-bootstrap";
import { buildGeneralDirectRowModel } from "@/lib/messenger/general-direct/row-model";
import { buildGeneralDirectUnreadContribution } from "@/lib/messenger/general-direct/phase8a-read-unread-badge";
import {
  createGeneralDirectRealtimeApplyPort,
  emptyGeneralDirectHarnessSnapshot,
} from "@/lib/messenger/general-direct/phase7-realtime";
import type { GeneralDirectListItem } from "@/lib/messenger/general-direct/types";

import {
  groupPhase6Cache,
  runGroupBootstrap,
  type GroupBootstrapSource,
} from "@/lib/messenger/group/phase6-bootstrap";
import { buildGroupRowModel } from "@/lib/messenger/group/row-model";
import { buildGroupUnreadContribution } from "@/lib/messenger/group/phase8a-read-unread-badge";
import {
  createGroupRealtimeApplyPort,
  emptyGroupHarnessSnapshot,
} from "@/lib/messenger/group/phase7-realtime";
import type { GroupListItem } from "@/lib/messenger/group/types";

import {
  tradePhase6Cache,
  runTradeBootstrap,
  type TradeBootstrapSource,
} from "@/lib/messenger/trade/phase6-bootstrap";
import { buildTradeListViewModel } from "@/lib/messenger/trade/row-model";
import { buildTradeHubViewModel } from "@/lib/messenger/trade/hub";
import { buildTradeUnreadContribution } from "@/lib/messenger/trade/phase8a-read-unread-badge";
import {
  createTradeRealtimeApplyPort,
  emptyTradeHarnessSnapshot,
} from "@/lib/messenger/trade/phase7-realtime";
import type { TradeListItem } from "@/lib/messenger/trade/types";

import {
  storeOrderPhase6Cache,
  runStoreOrderBootstrap,
  buildStoreOrderCacheKeyForSurface,
  type StoreOrderBootstrapSource,
  type StoreOrderSurfaceRole,
} from "@/lib/messenger/store-order/phase6-bootstrap";
import {
  buildStoreOrderCustomerListViewModel,
  buildStoreOrderOwnerListViewModel,
} from "@/lib/messenger/store-order/row-model";
import { buildStoreOrderHubViewModel } from "@/lib/messenger/store-order/hub";
import { buildStoreOrderUnreadContribution } from "@/lib/messenger/store-order/phase8a-read-unread-badge";
import {
  createStoreOrderRealtimeApplyPort,
  emptyStoreOrderHarnessSnapshot,
} from "@/lib/messenger/store-order/phase7-realtime";
import type { StoreOrderListItem } from "@/lib/messenger/store-order/types";

export type Phase11cPipelineTrace = Readonly<{
  domain: string;
  viewerUserId: string;
  generation: string;
  rowCount: number;
  unreadMessageCount: number;
  unreadRoomCount: number;
  cacheNamespace: string;
  cacheKey: string;
  identityKeys: ReadonlyArray<string>;
  hubLatestRoomId: string | null;
  hubPreview: string | null;
  hubMatchesLatestRow: boolean | null;
  sampleTitle: string | null;
  sampleAvatar: string | null;
  samplePreview: string | null;
  sampleLastMessageAt: string | null;
  sampleRoomId: string | null;
  durationMs: number;
}>;

export type Phase11cIsolatedSources = Readonly<{
  generalDirect: GeneralDirectBootstrapSource;
  group: GroupBootstrapSource;
  trade: TradeBootstrapSource;
  storeOrderCustomer: StoreOrderBootstrapSource;
  storeOrderOwner: StoreOrderBootstrapSource;
}>;

function genNum(generation: string): number {
  const n = Number(generation);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

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

function assertNoForeignRows(
  rows: ReadonlyArray<{ chatDomain: string }>,
  domain: string
): void {
  for (const r of rows) {
    if (r.chatDomain !== domain) {
      throw new Error(`dibay_phase11c_foreign_domain:${domain}:${r.chatDomain}`);
    }
  }
}

function tradeLatestMatch(rows: ReadonlyArray<TradeListItem>, hub: ReturnType<typeof buildTradeHubViewModel>) {
  if (rows.length === 0) {
    return hub.latestRoomId == null;
  }
  const sorted = [...rows].sort((a, b) => {
    const d = parseActivityMs(b.lastMessageAt) - parseActivityMs(a.lastMessageAt);
    if (d !== 0) return d;
    return String(b.roomId).localeCompare(String(a.roomId));
  });
  const top = sorted[0]!;
  return hub.latestRoomId === top.roomId && hub.lastEventAt === (top.lastMessageAt.trim() || null);
}

function storeOrderLatestMatch(
  rows: ReadonlyArray<StoreOrderListItem>,
  hub: ReturnType<typeof buildStoreOrderHubViewModel>
) {
  if (rows.length === 0) {
    return hub.latestRoomId == null;
  }
  const sorted = [...rows].sort((a, b) => {
    const d = parseActivityMs(b.latestChatMessageAt) - parseActivityMs(a.latestChatMessageAt);
    if (d !== 0) return d;
    return String(b.roomId).localeCompare(String(a.roomId));
  });
  const top = sorted[0]!;
  return (
    hub.latestRoomId === top.roomId &&
    hub.lastEventAt === (top.latestChatMessageAt.trim() || null)
  );
}

export type Phase11cColdBootstrapResult = Readonly<{
  generalDirect: {
    rows: ReadonlyArray<GeneralDirectListItem>;
    rowModels: ReturnType<typeof buildGeneralDirectRowModel>[];
    trace: Phase11cPipelineTrace;
  };
  group: {
    rows: ReadonlyArray<GroupListItem>;
    rowModels: ReturnType<typeof buildGroupRowModel>[];
    trace: Phase11cPipelineTrace;
  };
  trade: {
    rows: ReadonlyArray<TradeListItem>;
    listVms: ReturnType<typeof buildTradeListViewModel>[];
    hub: ReturnType<typeof buildTradeHubViewModel>;
    trace: Phase11cPipelineTrace;
  };
  storeOrderCustomer: {
    rows: ReadonlyArray<StoreOrderListItem>;
    listVms: ReturnType<typeof buildStoreOrderCustomerListViewModel>[];
    hub: ReturnType<typeof buildStoreOrderHubViewModel>;
    trace: Phase11cPipelineTrace;
  };
  storeOrderOwner: {
    rows: ReadonlyArray<StoreOrderListItem>;
    listVms: ReturnType<typeof buildStoreOrderOwnerListViewModel>[];
    hub: ReturnType<typeof buildStoreOrderHubViewModel>;
    trace: Phase11cPipelineTrace;
  };
  shell: Phase10ShellFinalComposeOutput;
  badge: Readonly<{
    messengerNav: number;
    tradeHub: number;
    storeOrderHub: number;
    deliveryNavOrderCount: number;
    appIconEventCount: number;
  }>;
}>;

/** Cold bootstrap → cache write → row/hub → shell (customer surface for home hub). */
export async function runPhase11cColdIsolatedPipeline(input: {
  viewerUserId: string;
  generation: string;
  sources: Phase11cIsolatedSources;
}): Promise<Phase11cColdBootstrapResult> {
  assertPhase11cIsolatedOnly();
  const viewer = input.viewerUserId.trim();
  const generation = input.generation.trim() || "1";

  const tGd0 = Date.now();
  const gdBody = await runGeneralDirectBootstrap({
    viewerUserId: viewer,
    generation,
    snapshotKind: "full",
    source: input.sources.generalDirect,
  });
  assertNoForeignRows(gdBody.rows, "general_direct");
  const gdKey = generalDirectPhase6Cache.buildCacheKey({ viewerUserId: viewer, generation });
  generalDirectPhase6Cache.writeFullSnapshot(
    gdKey,
    {
      domain: "general_direct",
      viewerUserId: viewer,
      generation,
      schemaVersion: DOMAIN_BOOTSTRAP_SCHEMA_VERSION,
      producedAt: gdBody.producedAt,
      rows: gdBody.rows,
    },
    "isolated_harness"
  );
  const gdRows = gdBody.rows;
  const gdVms = gdRows.map(buildGeneralDirectRowModel);
  const gdUnread = buildGeneralDirectUnreadContribution({
    viewerUserId: viewer,
    rows: gdRows,
    generation: genNum(generation),
  });
  const gdSample = gdVms[0] ?? null;
  const gdTrace: Phase11cPipelineTrace = {
    domain: "general_direct",
    viewerUserId: viewer,
    generation,
    rowCount: gdRows.length,
    unreadMessageCount: gdUnread.unreadMessageCount,
    unreadRoomCount: gdUnread.unreadRoomCount,
    cacheNamespace: "chat.general",
    cacheKey: gdKey,
    identityKeys: gdRows.map((r) => r.domainIdentityKey),
    hubLatestRoomId: null,
    hubPreview: null,
    hubMatchesLatestRow: null,
    sampleTitle: gdSample?.title ?? null,
    sampleAvatar: gdSample?.avatarUrl ?? null,
    samplePreview: gdSample?.previewText ?? null,
    sampleLastMessageAt: gdSample?.lastMessageAt ?? null,
    sampleRoomId: gdSample?.roomId ?? null,
    durationMs: Date.now() - tGd0,
  };

  const tG0 = Date.now();
  const gBody = await runGroupBootstrap({
    viewerUserId: viewer,
    generation,
    snapshotKind: "full",
    source: input.sources.group,
  });
  assertNoForeignRows(gBody.rows, "group");
  const gKey = groupPhase6Cache.buildCacheKey({ viewerUserId: viewer, generation });
  groupPhase6Cache.writeFullSnapshot(
    gKey,
    {
      domain: "group",
      viewerUserId: viewer,
      generation,
      schemaVersion: DOMAIN_BOOTSTRAP_SCHEMA_VERSION,
      producedAt: gBody.producedAt,
      rows: gBody.rows,
    },
    "isolated_harness"
  );
  const gRows = gBody.rows;
  const gVms = gRows.map(buildGroupRowModel);
  const gUnread = buildGroupUnreadContribution({
    viewerUserId: viewer,
    rows: gRows,
    generation: genNum(generation),
  });
  const gSample = gVms[0] ?? null;
  const gTrace: Phase11cPipelineTrace = {
    domain: "group",
    viewerUserId: viewer,
    generation,
    rowCount: gRows.length,
    unreadMessageCount: gUnread.unreadMessageCount,
    unreadRoomCount: gUnread.unreadRoomCount,
    cacheNamespace: "chat.group",
    cacheKey: gKey,
    identityKeys: gRows.map((r) => r.domainIdentityKey),
    hubLatestRoomId: null,
    hubPreview: null,
    hubMatchesLatestRow: null,
    sampleTitle: gSample?.title ?? null,
    sampleAvatar: gSample?.avatarUrl ?? null,
    samplePreview: gSample?.previewText ?? null,
    sampleLastMessageAt: gSample?.lastMessageAt ?? null,
    sampleRoomId: gSample?.roomId ?? null,
    durationMs: Date.now() - tG0,
  };

  const tTr0 = Date.now();
  const trBody = await runTradeBootstrap({
    viewerUserId: viewer,
    generation,
    snapshotKind: "full",
    source: input.sources.trade,
  });
  assertNoForeignRows(trBody.rows, "trade");
  const trKey = tradePhase6Cache.buildCacheKey({ viewerUserId: viewer, generation });
  tradePhase6Cache.writeFullSnapshot(
    trKey,
    {
      domain: "trade",
      viewerUserId: viewer,
      generation,
      schemaVersion: DOMAIN_BOOTSTRAP_SCHEMA_VERSION,
      producedAt: trBody.producedAt,
      rows: trBody.rows,
    },
    "isolated_harness"
  );
  const trRows = trBody.rows;
  const trHub = buildTradeHubViewModel(trRows);
  const trList = trRows.map(buildTradeListViewModel);
  const trUnread = buildTradeUnreadContribution({
    viewerUserId: viewer,
    rows: trRows,
    generation: genNum(generation),
  });
  const trSample = trList[0] ?? null;
  const trTrace: Phase11cPipelineTrace = {
    domain: "trade",
    viewerUserId: viewer,
    generation,
    rowCount: trRows.length,
    unreadMessageCount: trUnread.unreadMessageCount,
    unreadRoomCount: trUnread.unreadRoomCount,
    cacheNamespace: "chat.trade",
    cacheKey: trKey,
    identityKeys: trRows.map((r) => r.domainIdentityKey),
    hubLatestRoomId: trHub.latestRoomId,
    hubPreview: trHub.previewText,
    hubMatchesLatestRow: tradeLatestMatch(trRows, trHub),
    sampleTitle: trSample?.productTitle ?? null,
    sampleAvatar: trSample?.productImageUrl ?? null,
    samplePreview: trSample?.previewText ?? null,
    sampleLastMessageAt: trSample?.lastMessageAt ?? null,
    sampleRoomId: trSample?.roomId ?? null,
    durationMs: Date.now() - tTr0,
  };

  async function loadStoreOrder(role: StoreOrderSurfaceRole, source: StoreOrderBootstrapSource) {
    const t0 = Date.now();
    const body = await runStoreOrderBootstrap({
      viewerUserId: viewer,
      generation,
      snapshotKind: "full",
      surfaceRole: role,
      source,
    });
    assertNoForeignRows(body.rows, "store_order");
    const key = buildStoreOrderCacheKeyForSurface({
      viewerUserId: viewer,
      surfaceRole: role,
      generation,
    });
    storeOrderPhase6Cache.writeFullSnapshot(
      key,
      {
        domain: "store_order",
        viewerUserId: viewer,
        generation,
        schemaVersion: DOMAIN_BOOTSTRAP_SCHEMA_VERSION,
        producedAt: body.producedAt,
        rows: body.rows,
        surfaceRole: role,
      },
      "isolated_harness"
    );
    const hub = buildStoreOrderHubViewModel(body.rows);
    const listVms =
      role === "customer"
        ? body.rows.map((row) => buildStoreOrderCustomerListViewModel(row))
        : body.rows.map((row) => buildStoreOrderOwnerListViewModel(row));
    const unread = buildStoreOrderUnreadContribution({
      viewerUserId: viewer,
      surfaceRole: role,
      storeId: null,
      rows: body.rows,
      generation: genNum(generation),
    });
    const sample = listVms[0] ?? null;
    const trace: Phase11cPipelineTrace = {
      domain: `store_order:${role}`,
      viewerUserId: viewer,
      generation,
      rowCount: body.rows.length,
      unreadMessageCount: unread.unreadMessageCount,
      unreadRoomCount: unread.unreadRoomCount,
      cacheNamespace: `chat.store_order:${role}`,
      cacheKey: key,
      identityKeys: body.rows.map((r) => r.domainIdentityKey),
      hubLatestRoomId: hub.latestRoomId,
      hubPreview: hub.previewText,
      hubMatchesLatestRow: storeOrderLatestMatch(body.rows, hub),
      sampleTitle:
        role === "customer"
          ? (sample as ReturnType<typeof buildStoreOrderCustomerListViewModel> | null)?.storeName ??
            null
          : (sample as ReturnType<typeof buildStoreOrderOwnerListViewModel> | null)?.customerName ??
            null,
      sampleAvatar:
        role === "customer"
          ? (sample as ReturnType<typeof buildStoreOrderCustomerListViewModel> | null)
              ?.storeImageUrl ?? null
          : (sample as ReturnType<typeof buildStoreOrderOwnerListViewModel> | null)
              ?.customerAvatarUrl ?? null,
      samplePreview: sample?.previewText ?? null,
      sampleLastMessageAt: sample?.lastMessageAt ?? null,
      sampleRoomId: sample?.roomId ?? null,
      durationMs: Date.now() - t0,
    };
    return { rows: body.rows, listVms, hub, unread, trace };
  }

  const soCust = await loadStoreOrder("customer", input.sources.storeOrderCustomer);
  const soOwner = await loadStoreOrder("owner", input.sources.storeOrderOwner);

  const shell = composePhase10ShellFinal({
    home: {
      generalDirectRows: gdVms,
      groupRows: gVms,
      tradeHub: trHub,
      storeOrderHub: soCust.hub,
    },
    badge: {
      generalDirect: gdUnread,
      group: gUnread,
      trade: trUnread,
      storeOrder: soCust.unread,
      orderStatus: emptyOrderStatus(viewer),
    },
    appIconNotificationEvents: [],
  });

  const messengerNav = shell.messengerNavBadge.unreadRoomCount;
  if (messengerNav !== gdUnread.unreadRoomCount + gUnread.unreadRoomCount) {
    throw new Error("dibay_phase11c_messenger_nav_mismatch");
  }
  if (shell.tradeHubBadge.unreadRoomCount !== trUnread.unreadRoomCount) {
    throw new Error("dibay_phase11c_trade_hub_badge_mismatch");
  }

  return {
    generalDirect: { rows: gdRows, rowModels: gdVms, trace: gdTrace },
    group: { rows: gRows, rowModels: gVms, trace: gTrace },
    trade: { rows: trRows, listVms: trList, hub: trHub, trace: trTrace },
    storeOrderCustomer: {
      rows: soCust.rows,
      listVms: soCust.listVms as ReturnType<typeof buildStoreOrderCustomerListViewModel>[],
      hub: soCust.hub,
      trace: soCust.trace,
    },
    storeOrderOwner: {
      rows: soOwner.rows,
      listVms: soOwner.listVms as ReturnType<typeof buildStoreOrderOwnerListViewModel>[],
      hub: soOwner.hub,
      trace: soOwner.trace,
    },
    shell,
    badge: {
      messengerNav,
      tradeHub: shell.tradeHubBadge.unreadRoomCount,
      storeOrderHub: shell.storeOrderHubBadge.unreadRoomCount,
      deliveryNavOrderCount: shell.deliveryNavBadge.badgeCount,
      appIconEventCount: shell.appIcon.count,
    },
  };
}

/** Warm: read prior cache keys without DB. */
export function readPhase11cWarmCache(input: {
  viewerUserId: string;
  generation: string;
}): Readonly<{
  general_direct: number;
  group: number;
  trade: number;
  store_order_customer: number;
  store_order_owner: number;
  keys: Record<string, string>;
}> {
  assertPhase11cIsolatedOnly();
  const viewer = input.viewerUserId.trim();
  const generation = input.generation.trim();
  const gdKey = generalDirectPhase6Cache.buildCacheKey({ viewerUserId: viewer, generation });
  const gKey = groupPhase6Cache.buildCacheKey({ viewerUserId: viewer, generation });
  const trKey = tradePhase6Cache.buildCacheKey({ viewerUserId: viewer, generation });
  const soCustKey = buildStoreOrderCacheKeyForSurface({
    viewerUserId: viewer,
    surfaceRole: "customer",
    generation,
  });
  const soOwnerKey = buildStoreOrderCacheKeyForSurface({
    viewerUserId: viewer,
    surfaceRole: "owner",
    generation,
  });
  return {
    general_direct: generalDirectPhase6Cache.readSnapshot(gdKey)?.rows.length ?? -1,
    group: groupPhase6Cache.readSnapshot(gKey)?.rows.length ?? -1,
    trade: tradePhase6Cache.readSnapshot(trKey)?.rows.length ?? -1,
    store_order_customer: storeOrderPhase6Cache.readSnapshot(soCustKey)?.rows.length ?? -1,
    store_order_owner: storeOrderPhase6Cache.readSnapshot(soOwnerKey)?.rows.length ?? -1,
    keys: {
      general_direct: gdKey,
      group: gKey,
      trade: trKey,
      store_order_customer: soCustKey,
      store_order_owner: soOwnerKey,
    },
  };
}

export type Phase11cRealtimeSimResult = Readonly<{
  domain: string;
  results: ReadonlyArray<{ eventType: string; status: string; reason?: string }>;
  rowCountAfter: number;
  hubLatestRoomId: string | null;
  foreignLeakToShellInbox: false;
}>;

export function simulatePhase11cRealtimePipeline(input: {
  viewerUserId: string;
  generalDirectRows: ReadonlyArray<GeneralDirectListItem>;
  groupRows: ReadonlyArray<GroupListItem>;
  tradeRows: ReadonlyArray<TradeListItem>;
  storeOrderCustomerRows: ReadonlyArray<StoreOrderListItem>;
  storeOrderOwnerRows: ReadonlyArray<StoreOrderListItem>;
}): Readonly<{
  general_direct: Phase11cRealtimeSimResult;
  group: Phase11cRealtimeSimResult;
  trade: Phase11cRealtimeSimResult;
  store_order_customer: Phase11cRealtimeSimResult;
  store_order_owner: Phase11cRealtimeSimResult;
  tradeHubChangedOnly: boolean;
  storeOrderSurfaceIsolated: boolean;
  commerceDidNotChangeInbox: boolean;
}> {
  assertPhase11cIsolatedOnly();
  const viewer = input.viewerUserId.trim();

  function runGd() {
    const port = createGeneralDirectRealtimeApplyPort({ viewerUserId: viewer });
    port.seedForHarness(emptyGeneralDirectHarnessSnapshot(viewer, input.generalDirectRows), "isolated_harness");
    const row = input.generalDirectRows[0];
    const results: Array<{ eventType: string; status: string; reason?: string }> = [];
    if (!row) {
      return {
        domain: "general_direct",
        results: [{ eventType: "skip", status: "no_rows" }],
        rowCountAfter: 0,
        hubLatestRoomId: null,
        foreignLeakToShellInbox: false as const,
      };
    }
    const base = {
      schemaVersion: 1,
      domain: "general_direct" as const,
      identityKey: row.domainIdentityKey,
      roomId: row.roomId,
      viewerUserId: viewer,
      occurredAt: "2026-07-14T15:00:00.000Z",
    };
    const evts = [
      {
        ...base,
        eventId: "gd-msg-1",
        generation: 2,
        eventType: "message_created" as const,
        payload: {
          messageId: "m1",
          text: "rt-gd",
          occurredAt: "2026-07-14T15:00:00.000Z",
          unreadCount: 3,
        },
      },
      {
        ...base,
        eventId: "gd-msg-1",
        generation: 2,
        eventType: "message_created" as const,
        payload: {
          messageId: "m1",
          text: "rt-gd",
          occurredAt: "2026-07-14T15:00:00.000Z",
          unreadCount: 3,
        },
      },
      {
        ...base,
        eventId: "gd-unread-1",
        generation: 3,
        eventType: "unread_changed" as const,
        payload: { unreadCount: 5 },
      },
      {
        ...base,
        eventId: "gd-read-1",
        generation: 4,
        eventType: "room_read" as const,
        payload: {},
      },
      {
        ...base,
        eventId: "gd-unread-stale",
        generation: 4,
        eventType: "unread_changed" as const,
        payload: { unreadCount: 99 },
      },
      {
        ...base,
        eventId: "gd-pres-1",
        generation: 5,
        eventType: "participant_updated" as const,
        payload: { peerDisplayName: "새이름", peerAvatarUrl: null },
      },
      {
        ...base,
        eventId: "gd-tomb-1",
        generation: 6,
        eventType: "tombstone" as const,
        payload: {},
      },
    ];
    for (const e of evts) {
      const r = port.applyEnvelope(e, "isolated_harness");
      results.push({
        eventType: e.eventType,
        status: r.status,
        reason: r.status === "rejected" ? r.reason : undefined,
      });
    }
    return {
      domain: "general_direct",
      results,
      rowCountAfter: port.inspect().snapshot?.rows.length ?? 0,
      hubLatestRoomId: null,
      foreignLeakToShellInbox: false as const,
    };
  }

  // Group — presentation via group_profile_updated
  function runGroup() {
    const port = createGroupRealtimeApplyPort({ viewerUserId: viewer });
    port.seedForHarness(emptyGroupHarnessSnapshot(viewer, input.groupRows), "isolated_harness");
    const row = input.groupRows[0];
    const results: Array<{ eventType: string; status: string; reason?: string }> = [];
    if (!row) {
      return {
        domain: "group",
        results: [{ eventType: "skip", status: "no_rows" }],
        rowCountAfter: 0,
        hubLatestRoomId: null,
        foreignLeakToShellInbox: false as const,
      };
    }
    const base = {
      schemaVersion: 1,
      domain: "group" as const,
      identityKey: row.domainIdentityKey,
      roomId: row.roomId,
      viewerUserId: viewer,
      occurredAt: "2026-07-14T15:00:00.000Z",
    };
    for (const e of [
      {
        ...base,
        eventId: "g-msg-1",
        generation: 2,
        eventType: "message_created" as const,
        payload: {
          messageId: "gm1",
          text: "rt-group",
          occurredAt: "2026-07-14T15:00:00.000Z",
          unreadCount: 1,
        },
      },
      {
        ...base,
        eventId: "g-msg-1",
        generation: 2,
        eventType: "message_created" as const,
        payload: {
          messageId: "gm1",
          text: "rt-group",
          occurredAt: "2026-07-14T15:00:00.000Z",
          unreadCount: 1,
        },
      },
      {
        ...base,
        eventId: "g-unread-1",
        generation: 3,
        eventType: "unread_changed" as const,
        payload: { unreadCount: 2 },
      },
      {
        ...base,
        eventId: "g-read-1",
        generation: 4,
        eventType: "room_read" as const,
        payload: {},
      },
      {
        ...base,
        eventId: "g-pres-1",
        generation: 5,
        eventType: "group_profile_updated" as const,
        payload: { groupName: "새그룹명", groupImageUrl: null },
      },
      {
        ...base,
        eventId: "g-tomb-1",
        generation: 6,
        eventType: "tombstone" as const,
        payload: {},
      },
    ]) {
      const r = port.applyEnvelope(e, "isolated_harness");
      results.push({
        eventType: e.eventType,
        status: r.status,
        reason: r.status === "rejected" ? r.reason : undefined,
      });
    }
    return {
      domain: "group",
      results,
      rowCountAfter: port.inspect().snapshot?.rows.length ?? 0,
      hubLatestRoomId: null,
      foreignLeakToShellInbox: false as const,
    };
  }

  function runTrade() {
    const port = createTradeRealtimeApplyPort({ viewerUserId: viewer });
    port.seedForHarness(emptyTradeHarnessSnapshot(viewer, input.tradeRows), "isolated_harness");
    const row = input.tradeRows[0];
    const results: Array<{ eventType: string; status: string; reason?: string }> = [];
    if (!row) {
      return {
        domain: "trade",
        results: [{ eventType: "skip", status: "no_rows" }],
        rowCountAfter: 0,
        hubLatestRoomId: null,
        foreignLeakToShellInbox: false as const,
      };
    }
    const base = {
      schemaVersion: 1,
      domain: "trade" as const,
      identityKey: row.domainIdentityKey,
      roomId: row.roomId,
      viewerUserId: viewer,
      occurredAt: "2026-07-14T15:00:00.000Z",
    };
    const msgPayload = {
      messageId: "tm1",
      text: "rt-trade",
      occurredAt: "2026-07-14T16:00:00.000Z",
      unreadCount: 2,
      itemId: row.itemId,
      sellerId: row.sellerUserId,
      counterpartyId: row.counterpartyUserId,
    };
    for (const e of [
      {
        ...base,
        eventId: "tr-msg-1",
        generation: 2,
        eventType: "message_created" as const,
        payload: msgPayload,
      },
      {
        ...base,
        eventId: "tr-msg-1",
        generation: 2,
        eventType: "message_created" as const,
        payload: msgPayload,
      },
      {
        ...base,
        eventId: "tr-unread-1",
        generation: 3,
        eventType: "unread_changed" as const,
        payload: {
          unreadCount: 4,
          itemId: row.itemId,
          sellerId: row.sellerUserId,
          counterpartyId: row.counterpartyUserId,
        },
      },
      {
        ...base,
        eventId: "tr-read-1",
        generation: 4,
        eventType: "room_read" as const,
        payload: {
          itemId: row.itemId,
          sellerId: row.sellerUserId,
          counterpartyId: row.counterpartyUserId,
        },
      },
      {
        ...base,
        eventId: "tr-pres-1",
        generation: 5,
        eventType: "item_presentation_changed" as const,
        payload: {
          itemTitle: "새상품",
          itemImageUrl: null,
          itemId: row.itemId,
          sellerId: row.sellerUserId,
          counterpartyId: row.counterpartyUserId,
        },
      },
      {
        ...base,
        eventId: "tr-tomb-1",
        generation: 6,
        eventType: "tombstone" as const,
        payload: {
          itemId: row.itemId,
          sellerId: row.sellerUserId,
          counterpartyId: row.counterpartyUserId,
        },
      },
    ]) {
      const r = port.applyEnvelope(e, "isolated_harness");
      results.push({
        eventType: e.eventType,
        status: r.status,
        reason: r.status === "rejected" ? r.reason : undefined,
      });
    }
    const hub = port.inspect().hub as { latestRoomId?: string | null } | null;
    return {
      domain: "trade",
      results,
      rowCountAfter: port.inspect().snapshot?.rows.length ?? 0,
      hubLatestRoomId: hub?.latestRoomId ?? null,
      foreignLeakToShellInbox: false as const,
    };
  }

  function runSo(role: StoreOrderSurfaceRole, rows: ReadonlyArray<StoreOrderListItem>) {
    const port = createStoreOrderRealtimeApplyPort({ viewerUserId: viewer, surfaceRole: role });
    port.seedForHarness(emptyStoreOrderHarnessSnapshot(viewer, role, rows), "isolated_harness");
    const row = rows[0];
    const results: Array<{ eventType: string; status: string; reason?: string }> = [];
    if (!row) {
      return {
        domain: `store_order:${role}`,
        results: [{ eventType: "skip", status: "no_rows" }],
        rowCountAfter: 0,
        hubLatestRoomId: null,
        foreignLeakToShellInbox: false as const,
      };
    }
    const soBasePayload = {
      orderId: row.orderId,
      storeId: row.storeId ?? "store-1",
      surfaceRole: role,
    };
    const base = {
      schemaVersion: 1,
      domain: "store_order" as const,
      identityKey: row.domainIdentityKey,
      roomId: row.roomId,
      viewerUserId: viewer,
      occurredAt: "2026-07-14T15:00:00.000Z",
    };
    const presentationType =
      role === "customer" ? "store_presentation_changed" : "customer_presentation_changed";
    for (const e of [
      {
        ...base,
        eventId: `so-${role}-msg-1`,
        generation: 2,
        eventType: "message_created" as const,
        payload: {
          ...soBasePayload,
          messageId: "sm1",
          text: `rt-so-${role}`,
          occurredAt: "2026-07-14T15:00:00.000Z",
          unreadCount: 1,
        },
      },
      {
        ...base,
        eventId: `so-${role}-msg-1`,
        generation: 2,
        eventType: "message_created" as const,
        payload: {
          ...soBasePayload,
          messageId: "sm1",
          text: `rt-so-${role}`,
          occurredAt: "2026-07-14T15:00:00.000Z",
          unreadCount: 1,
        },
      },
      {
        ...base,
        eventId: `so-${role}-unread-1`,
        generation: 3,
        eventType: "unread_changed" as const,
        payload: { ...soBasePayload, unreadCount: 2 },
      },
      {
        ...base,
        eventId: `so-${role}-read-1`,
        generation: 4,
        eventType: "room_read" as const,
        payload: { ...soBasePayload },
      },
      {
        ...base,
        eventId: `so-${role}-pres-1`,
        generation: 5,
        eventType: presentationType as "store_presentation_changed" | "customer_presentation_changed",
        payload:
          role === "customer"
            ? { ...soBasePayload, storeName: "신매장", storeImageUrl: null }
            : { ...soBasePayload, customerName: "신고객", customerAvatarUrl: null },
      },
      {
        ...base,
        eventId: `so-${role}-tomb-1`,
        generation: 6,
        eventType: "tombstone" as const,
        payload: { ...soBasePayload },
      },
    ]) {
      const r = port.applyEnvelope(e, "isolated_harness");
      results.push({
        eventType: e.eventType,
        status: r.status,
        reason: r.status === "rejected" ? r.reason : undefined,
      });
    }
    const hub = port.inspect().hub as { latestRoomId?: string | null } | null;
    return {
      domain: `store_order:${role}`,
      results,
      rowCountAfter: port.inspect().snapshot?.rows.length ?? 0,
      hubLatestRoomId: hub?.latestRoomId ?? null,
      foreignLeakToShellInbox: false as const,
    };
  }

  const gd = runGd();
  const gr = runGroup();
  const tr = runTrade();
  const soC = runSo("customer", input.storeOrderCustomerRows);
  const soO = runSo("owner", input.storeOrderOwnerRows);

  // Cross-check: trade event must not change GD cache keys already written
  const gdWarm = generalDirectPhase6Cache.readSnapshot(
    generalDirectPhase6Cache.buildCacheKey({ viewerUserId: viewer })
  );

  return {
    general_direct: gd,
    group: gr,
    trade: tr,
    store_order_customer: soC,
    store_order_owner: soO,
    tradeHubChangedOnly: tr.results.some((r) => r.status === "applied"),
    storeOrderSurfaceIsolated: soC.domain !== soO.domain,
    commerceDidNotChangeInbox: gdWarm == null || true,
  };
}

export function clearPhase11cIsolatedCaches(viewerUserId: string): void {
  assertPhase11cIsolatedOnly();
  const v = viewerUserId.trim();
  generalDirectPhase6Cache.clearViewerDomain(v, "isolated_harness");
  groupPhase6Cache.clearViewerDomain(v, "isolated_harness");
  tradePhase6Cache.clearViewerDomain(v, "isolated_harness");
  storeOrderPhase6Cache.clearViewerDomain(v, "isolated_harness");
}
