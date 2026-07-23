/**
 * Phase 11D-A — Domain Bootstrap HTTP (read-only) + Shadow / Shell capture.
 * persistent cache write 0 · Realtime 0 · production home wiring 0.
 *
 * STEP1 Production Readiness:
 * - allowlist → canary Domain bootstrap (Read Surface authority unchanged)
 * - authenticated non-allowlist → Domain HTTP live read (`bootstrap_http_live_read`)
 * - Shell UI / home React wiring remain allowlist-only (separate gate)
 * - killed → null (isolated 503 fallthrough)
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { ChatDomain } from "@/lib/chat-domain/chat-domain";
import type { OrderStatusContributionPhase8b } from "@/lib/messenger/contracts/delivery-nav-aggregator-phase8b";
import { parseActivityMs } from "@/lib/messenger/contracts/latest-activity-selector";
import {
  createGeneralDirectLiveBootstrapSource,
  createGroupLiveBootstrapSource,
  createTradeLiveBootstrapSource,
  createStoreOrderCustomerLiveBootstrapSource,
  type Phase11bLiveLoadMeta,
} from "@/lib/messenger/contracts/phase11b-live-domain-loaders";
import {
  assertPhase11dALayerContract,
  getPhase11dAShadowPassStreak,
  isPhase11dAShellDisplayAllowed,
  killPhase11dACanary,
  phase11dAAccessResponse,
  recordPhase11dAShadowPass,
  resolvePhase11dACanaryAccess,
  PHASE11D_A_PRODUCTION_HOME_WIRING,
} from "@/lib/messenger/contracts/phase11da-canary-gate";
import { seedDomainCacheAuthoritySnapshot, rollbackDomainCacheAuthority } from "@/lib/messenger/contracts/domain-cache-authority";
import { domainBootstrapErrorResponse } from "@/lib/messenger/contracts/phase6-api-route";
import { runGeneralDirectBootstrap } from "@/lib/messenger/general-direct/phase6-bootstrap";
import { runGroupBootstrap } from "@/lib/messenger/group/phase6-bootstrap";
import { runTradeBootstrap } from "@/lib/messenger/trade/phase6-bootstrap";
import { runStoreOrderBootstrap } from "@/lib/messenger/store-order/phase6-bootstrap";
import { buildGeneralDirectRowModel } from "@/lib/messenger/general-direct/row-model";
import { buildGroupRowModel } from "@/lib/messenger/group/row-model";
import { buildTradeListViewModel } from "@/lib/messenger/trade/row-model";
import { buildTradeHubViewModel } from "@/lib/messenger/trade/hub";
import { buildStoreOrderCustomerListViewModel } from "@/lib/messenger/store-order/row-model";
import { buildStoreOrderHubViewModel } from "@/lib/messenger/store-order/hub";
import { composePhase10ShellFinal } from "@/lib/messenger/shell/phase10-final-compose";
import { buildGeneralDirectUnreadContribution } from "@/lib/messenger/general-direct/phase8a-read-unread-badge";
import { buildGroupUnreadContribution } from "@/lib/messenger/group/phase8a-read-unread-badge";
import { buildTradeUnreadContribution } from "@/lib/messenger/trade/phase8a-read-unread-badge";
import { buildStoreOrderUnreadContribution } from "@/lib/messenger/store-order/phase8a-read-unread-badge";
import type { StoreOrderListItem } from "@/lib/messenger/store-order/types";
import type { TradeListItem } from "@/lib/messenger/trade/types";

function createCanaryReadonlyClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("dibay_phase11da_supabase_env_missing");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
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

function hubMatchesLatestRoom(
  rows: ReadonlyArray<{ roomId: string; activityAt: string | null | undefined }>,
  latestRoomId: string | null
): boolean {
  if (rows.length === 0) return latestRoomId == null;
  const sorted = [...rows].sort((a, b) => {
    const d = parseActivityMs(b.activityAt) - parseActivityMs(a.activityAt);
    if (d !== 0) return d;
    return b.roomId.localeCompare(a.roomId);
  });
  return sorted[0]?.roomId === latestRoomId;
}

function bootstrapHttpMeta(mode: "canary" | "bootstrap_http_live_read") {
  if (mode === "canary") {
    return { canary: "phase11da" as const, authority: "domain_bootstrap" as const, mode };
  }
  return {
    canary: null,
    authority: "domain_bootstrap" as const,
    mode: "bootstrap_http_live_read" as const,
    readiness: "bootstrap_production_readiness" as const,
  };
}

/**
 * Authenticated Domain Bootstrap Response (allowlist canary or readiness live read).
 * killed → null (legacy gate fallthrough).
 * spoof / owner_excluded → error Response.
 */
export async function tryPhase11dACanaryDomainBootstrap(input: {
  request: Request;
  domain: ChatDomain;
  authenticatedUserId: string;
  surfaceRole?: "customer" | "owner" | null;
}): Promise<NextResponse | null> {
  assertPhase11dALayerContract();

  const url = new URL(input.request.url);
  const spoof =
    url.searchParams.get("viewerUserId") ??
    url.searchParams.get("userId") ??
    url.searchParams.get("viewer");

  const access = resolvePhase11dACanaryAccess({
    authenticatedUserId: input.authenticatedUserId,
    requestedViewerUserId: spoof,
    domain: input.domain,
    surfaceRole: input.surfaceRole,
  });

  if (!access.ok) {
    if (access.reason === "killed") {
      return null;
    }
    return NextResponse.json(phase11dAAccessResponse(access), { status: access.status });
  }

  const viewerUserId = access.viewerUserId;
  const httpMeta = bootstrapHttpMeta(access.mode);
  const generation = String(Date.now());
  const sb = createCanaryReadonlyClient();

  try {
    if (input.domain === "general_direct") {
      const body = await runGeneralDirectBootstrap({
        viewerUserId,
        generation,
        snapshotKind: "full",
        source: createGeneralDirectLiveBootstrapSource(sb),
      });
      if (body.viewerUserId !== viewerUserId) {
        return NextResponse.json(
          { error: "viewer_mismatch", code: "dibay_phase11da_viewer_mismatch" },
          { status: 500 }
        );
      }
      // STEP2 — allowlist Domain Cache seed only (non-allowlist live-read → no seed)
      if (access.mode === "canary") {
        seedDomainCacheAuthoritySnapshot({
          domain: "general_direct",
          viewerUserId,
          generation,
          producedAt: body.producedAt,
          rows: body.rows,
        });
      }
      return NextResponse.json({
        ...body,
        ...httpMeta,
      });
    }
    if (input.domain === "group") {
      const body = await runGroupBootstrap({
        viewerUserId,
        generation,
        snapshotKind: "full",
        source: createGroupLiveBootstrapSource(sb),
      });
      if (access.mode === "canary") {
        seedDomainCacheAuthoritySnapshot({
          domain: "group",
          viewerUserId,
          generation,
          producedAt: body.producedAt,
          rows: body.rows,
        });
      }
      return NextResponse.json({
        ...body,
        ...httpMeta,
      });
    }
    if (input.domain === "trade") {
      const body = await runTradeBootstrap({
        viewerUserId,
        generation,
        snapshotKind: "full",
        source: createTradeLiveBootstrapSource(sb),
      });
      if (access.mode === "canary") {
        seedDomainCacheAuthoritySnapshot({
          domain: "trade",
          viewerUserId,
          generation,
          producedAt: body.producedAt,
          rows: body.rows,
        });
      }
      return NextResponse.json({
        ...body,
        ...httpMeta,
      });
    }
    if (input.domain === "store_order") {
      if (input.surfaceRole === "owner") {
        return NextResponse.json(
          {
            error: "dibay_phase11da_store_order_owner_excluded",
            code: "dibay_phase11da_store_order_owner_excluded",
          },
          { status: 503 }
        );
      }
      const body = await runStoreOrderBootstrap({
        viewerUserId,
        generation,
        snapshotKind: "full",
        surfaceRole: "customer",
        source: createStoreOrderCustomerLiveBootstrapSource(sb),
      });
      if (access.mode === "canary") {
        seedDomainCacheAuthoritySnapshot({
          domain: "store_order",
          viewerUserId,
          generation,
          producedAt: body.producedAt,
          rows: body.rows,
          surfaceRole: "customer",
        });
      }
      return NextResponse.json({
        ...body,
        ...httpMeta,
      });
    }
    return NextResponse.json({ error: "unsupported_domain" }, { status: 400 });
  } catch (err) {
    return domainBootstrapErrorResponse(err);
  }
}

export type Phase11dAShadowParityRow = Readonly<{
  roomId: string;
  chatDomain: string;
  domainIdentityKey: string;
  lastMessageAt: string | null;
  unread: number;
  orderId?: string | null;
  /** title/preview omitted from observe logs — present for offline parity reuse */
  title: string;
  preview: string;
  avatar: string | null;
}>;

export type Phase11dAShadowCompareResult = Readonly<{
  pass: boolean;
  reasons: ReadonlyArray<string>;
  newInboxRoomIds: ReadonlyArray<string>;
  newGroupRoomIds: ReadonlyArray<string>;
  tradeRoomIds: ReadonlyArray<string>;
  storeOrderRoomIds: ReadonlyArray<string>;
  parityRows: {
    generalDirect: ReadonlyArray<Phase11dAShadowParityRow>;
    group: ReadonlyArray<Phase11dAShadowParityRow>;
    trade: ReadonlyArray<Phase11dAShadowParityRow>;
    storeOrder: ReadonlyArray<Phase11dAShadowParityRow>;
  };
  tradeHub: {
    roomCount: number;
    unreadCount: number;
    latestRoomId: string | null;
    preview: string;
  };
  storeOrderHub: {
    roomCount: number;
    unreadCount: number;
    latestRoomId: string | null;
    preview: string;
  };
  contamination: {
    tradeInInbox: boolean;
    storeOrderInInbox: boolean;
  };
  storeOrderCustomer: {
    allStoreTitles: boolean;
    ownerNameLeak: boolean;
    hubMatchesLatest: boolean;
    distinctOrders: number;
    sampleStoreName: string | null;
    sampleStoreImage: string | null;
    samplePreview: string | null;
  };
  durationMs: number;
  metas: Record<string, Phase11bLiveLoadMeta | null>;
  shellDisplayAllowedAfter: boolean;
  writes: {
    sessionStorage: 0;
    localStorage: 0;
    persistentDomainCache: 0;
    realtime: 0;
    badge: 0;
    legacyStateMutated: 0;
  };
}>;

/** Shadow: 신규 Domain snapshot invariants (legacy merge 금지 · write 0). */
export async function runPhase11dAShadowCompare(
  viewerUserId: string,
  opts?: Readonly<{
    /**
     * Allowlist canary harness may unlock in-memory shell after 3 passes.
     * Legacy CM bootstrap shadow observe must keep this false (UI/shell unlock 0).
     */
    recordShellUnlock?: boolean;
  }>
): Promise<Phase11dAShadowCompareResult> {
  assertPhase11dALayerContract();
  if (PHASE11D_A_PRODUCTION_HOME_WIRING) {
    throw new Error("dibay_phase11da_production_home_wiring_forbidden");
  }
  const t0 = Date.now();
  const sb = createCanaryReadonlyClient();
  const metas: Record<string, Phase11bLiveLoadMeta | null> = {
    gd: null,
    group: null,
    trade: null,
    so: null,
  };
  const generation = `11da-shadow-${Date.now()}`;

  const [gd, group, trade, so] = await Promise.all([
    runGeneralDirectBootstrap({
      viewerUserId,
      generation,
      snapshotKind: "full",
      source: createGeneralDirectLiveBootstrapSource(sb, (m) => {
        metas.gd = m;
      }),
    }),
    runGroupBootstrap({
      viewerUserId,
      generation,
      snapshotKind: "full",
      source: createGroupLiveBootstrapSource(sb, (m) => {
        metas.group = m;
      }),
    }),
    runTradeBootstrap({
      viewerUserId,
      generation,
      snapshotKind: "full",
      source: createTradeLiveBootstrapSource(sb, (m) => {
        metas.trade = m;
      }),
    }),
    runStoreOrderBootstrap({
      viewerUserId,
      generation,
      snapshotKind: "full",
      surfaceRole: "customer",
      source: createStoreOrderCustomerLiveBootstrapSource(sb, (m) => {
        metas.so = m;
      }),
    }),
  ]);

  const gdVms = gd.rows.map(buildGeneralDirectRowModel);
  const gVms = group.rows.map(buildGroupRowModel);
  const trHub = buildTradeHubViewModel(trade.rows as ReadonlyArray<TradeListItem>);
  const soHub = buildStoreOrderHubViewModel(so.rows as ReadonlyArray<StoreOrderListItem>);
  const soList = so.rows.map((row) => buildStoreOrderCustomerListViewModel(row));
  const trList = trade.rows.map(buildTradeListViewModel);

  const shell = composePhase10ShellFinal({
    home: {
      generalDirectRows: gdVms,
      groupRows: gVms,
      tradeHub: trHub,
      storeOrderHub: soHub,
    },
    badge: {
      generalDirect: buildGeneralDirectUnreadContribution({
        viewerUserId,
        rows: gd.rows,
        generation: 1,
      }),
      group: buildGroupUnreadContribution({ viewerUserId, rows: group.rows, generation: 1 }),
      trade: buildTradeUnreadContribution({ viewerUserId, rows: trade.rows, generation: 1 }),
      storeOrder: buildStoreOrderUnreadContribution({
        viewerUserId,
        surfaceRole: "customer",
        storeId: null,
        rows: so.rows,
        generation: 1,
      }),
      orderStatus: emptyOrderStatus(viewerUserId),
    },
    appIconNotificationEvents: [],
  });

  const reasons: string[] = [];
  const tradeInInbox = shell.home.inboxRows.map((e) => e.domain as string).includes("trade");
  const storeOrderInInbox = shell.home.inboxRows.map((e) => e.domain as string).includes("store_order");
  if (tradeInInbox) reasons.push("trade_in_inbox");
  if (storeOrderInInbox) reasons.push("store_order_in_inbox");
  if (shell.home.tradeHub.domain !== "trade") reasons.push("trade_hub_missing");
  if (shell.home.storeOrderHub.domain !== "store_order") reasons.push("so_hub_missing");

  const hubMatchesLatest = hubMatchesLatestRoom(
    so.rows.map((r) => ({ roomId: r.roomId, activityAt: r.latestChatMessageAt })),
    soHub.latestRoomId
  );
  const tradeHubOk = hubMatchesLatestRoom(
    trade.rows.map((r) => ({ roomId: r.roomId, activityAt: r.lastMessageAt })),
    trHub.latestRoomId
  );

  const allStoreTitles = soList.every((r) => typeof r.storeName === "string" && r.storeName.length > 0);
  // owner 회원명 경로 미사용 — Customer VM 에 customerName 필드 자체가 없음
  const ownerNameLeak = soList.some((r) => "customerName" in r);

  if (!hubMatchesLatest) reasons.push("so_hub_latest_mismatch");
  if (!tradeHubOk) reasons.push("trade_hub_latest_mismatch");
  if (!allStoreTitles && soList.length > 0) reasons.push("so_missing_store_title");

  const foreignGd = gd.rows.some((r) => r.chatDomain !== "general_direct");
  const foreignG = group.rows.some((r) => r.chatDomain !== "group");
  const foreignTr = trade.rows.some((r) => r.chatDomain !== "trade");
  const foreignSo = so.rows.some((r) => r.chatDomain !== "store_order");
  if (foreignGd || foreignG || foreignTr || foreignSo) reasons.push("domain_contamination");

  const dupIdentity = (keys: ReadonlyArray<string>) => {
    const seen = new Set<string>();
    for (const k of keys) {
      if (!k) continue;
      if (seen.has(k)) return true;
      seen.add(k);
    }
    return false;
  };
  if (dupIdentity(gd.rows.map((r) => r.domainIdentityKey))) reasons.push("gd_duplicate_identity");
  if (dupIdentity(group.rows.map((r) => r.domainIdentityKey))) reasons.push("group_duplicate_identity");
  if (dupIdentity(trade.rows.map((r) => r.domainIdentityKey))) reasons.push("trade_duplicate_identity");
  if (dupIdentity(so.rows.map((r) => r.domainIdentityKey))) reasons.push("so_duplicate_identity");
  if (dupIdentity(so.rows.map((r) => r.orderId))) reasons.push("so_duplicate_order_id");

  const pass = reasons.length === 0;
  const streak =
    opts?.recordShellUnlock === false
      ? {
          streak: getPhase11dAShadowPassStreak(),
          shellDisplayAllowed: isPhase11dAShellDisplayAllowed(),
        }
      : recordPhase11dAShadowPass(pass);

  const sample = soList[0] ?? null;

  const parityRows = {
    generalDirect: gdVms.map(
      (r): Phase11dAShadowParityRow => ({
        roomId: r.roomId,
        chatDomain: r.chatDomain,
        domainIdentityKey: r.domainIdentityKey,
        lastMessageAt: r.lastMessageAt ?? null,
        unread: r.unreadCount,
        title: r.title,
        preview: r.previewText,
        avatar: r.avatarUrl,
      })
    ),
    group: gVms.map(
      (r): Phase11dAShadowParityRow => ({
        roomId: r.roomId,
        chatDomain: r.chatDomain,
        domainIdentityKey: r.domainIdentityKey,
        lastMessageAt: r.lastMessageAt ?? null,
        unread: r.unreadCount,
        title: r.title,
        preview: r.previewText,
        avatar: r.avatarUrl,
      })
    ),
    trade: trade.rows.map((r, i): Phase11dAShadowParityRow => {
      const vm = trList[i];
      return {
        roomId: r.roomId,
        chatDomain: r.chatDomain,
        domainIdentityKey: r.domainIdentityKey,
        lastMessageAt: r.lastMessageAt ?? null,
        unread: r.unreadCount,
        title: vm?.productTitle || vm?.peerLabel || "",
        preview: vm?.previewText ?? "",
        avatar: vm?.productImageUrl ?? null,
      };
    }),
    storeOrder: soList.map(
      (r): Phase11dAShadowParityRow => ({
        roomId: r.roomId,
        chatDomain: r.chatDomain,
        domainIdentityKey: r.domainIdentityKey,
        lastMessageAt: r.lastMessageAt ?? null,
        unread: r.unreadCount,
        orderId: r.orderId,
        title: r.storeName,
        preview: r.previewText,
        avatar: r.storeImageUrl,
      })
    ),
  };

  return {
    pass,
    reasons,
    newInboxRoomIds: gdVms.map((r) => r.roomId),
    newGroupRoomIds: gVms.map((r) => r.roomId),
    tradeRoomIds: trade.rows.map((r) => r.roomId),
    storeOrderRoomIds: so.rows.map((r) => r.roomId),
    parityRows,
    tradeHub: {
      roomCount: trHub.roomCount,
      unreadCount: trHub.unreadCount,
      latestRoomId: trHub.latestRoomId,
      preview: trHub.previewText,
    },
    storeOrderHub: {
      roomCount: soHub.roomCount,
      unreadCount: soHub.unreadCount,
      latestRoomId: soHub.latestRoomId,
      preview: soHub.previewText,
    },
    contamination: { tradeInInbox, storeOrderInInbox },
    storeOrderCustomer: {
      allStoreTitles,
      ownerNameLeak,
      hubMatchesLatest,
      distinctOrders: new Set(so.rows.map((r) => r.orderId)).size,
      sampleStoreName: sample?.storeName ?? null,
      sampleStoreImage: sample?.storeImageUrl ?? null,
      samplePreview: sample?.previewText ?? null,
    },
    durationMs: Date.now() - t0,
    metas,
    shellDisplayAllowedAfter: streak.shellDisplayAllowed,
    writes: {
      sessionStorage: 0,
      localStorage: 0,
      persistentDomainCache: 0,
      realtime: 0,
      badge: 0,
      legacyStateMutated: 0,
    },
  };
}

export type Phase11dACanaryShellCapture = Readonly<{
  displayAllowed: true;
  killed: false;
  productionHomeWiring: false;
  roomHeaderRuntime: "NOT_WIRED";
  inboxDomains: ReadonlyArray<"general_direct" | "group">;
  tradeHubRoomCount: number;
  storeOrderHubRoomCount: number;
  badgeWiringApplied: false;
  authority: "domain_shell_canary_memory";
}>;

/** Shell Read Canary — 메모리 ViewModel만. production home 미연결. */
export async function capturePhase11dACanaryShell(
  viewerUserId: string
): Promise<
  Phase11dACanaryShellCapture | { error: string; status: "legacy_surface"; displayAllowed: false }
> {
  if (!isPhase11dAShellDisplayAllowed()) {
    return {
      error: "shell_display_requires_3_shadow_pass",
      status: "legacy_surface",
      displayAllowed: false,
    };
  }
  const shadow = await runPhase11dAShadowCompare(viewerUserId);
  if (!shadow.pass) {
    return {
      error: "shell_failed_revert_legacy",
      status: "legacy_surface",
      displayAllowed: false,
    };
  }
  return {
    displayAllowed: true,
    killed: false,
    productionHomeWiring: false,
    roomHeaderRuntime: "NOT_WIRED",
    inboxDomains: ["general_direct", "group"],
    tradeHubRoomCount: shadow.tradeHub.roomCount,
    storeOrderHubRoomCount: shadow.storeOrderHub.roomCount,
    badgeWiringApplied: false,
    authority: "domain_shell_canary_memory",
  };
}

export function executePhase11dAKill(viewerUserId?: string): {
  bootstrapStopped: true;
  shellStopped: true;
  legacyRestored: true;
  persistentCleanup: "domain_cache_cleared" | "none";
  backgroundCallsAllowed: false;
} {
  killPhase11dACanary("harness");
  let persistentCleanup: "domain_cache_cleared" | "none" = "none";
  const uid = viewerUserId?.trim();
  if (uid) {
    rollbackDomainCacheAuthority(uid);
    persistentCleanup = "domain_cache_cleared";
  }
  return {
    bootstrapStopped: true,
    shellStopped: true,
    legacyRestored: true,
    persistentCleanup,
    backgroundCallsAllowed: false,
  };
}
