/**
 * 메신저 목록 `unreadCount` 는 기본적으로 CM 참가자 행만 쓰는데,
 * `GET /api/me/store-owner-hub-badge` 의 `chatUnread`(거래 레거시)는
 * `item_trade` 커서 힌트 + (통합방 없을 때) `product_chats` 미읽음을 합산한다.
 * 그 차이로 **탭에만 1이 있고 목록 줄에는 뱃지가 없는** 불일치가 난다.
 *
 * 거래 맥락(`contextMeta.kind === "trade"`) 방에 대해 동일 소스를 반영:
 * - `chat_rooms` (`room_type=item_trade`, `community_messenger_room_id` = CM 방 id) 커서 힌트
 * - 위가 없으면 `product_chats.id = contextMeta.productChatId` 의 seller/buyer unread 컬럼
 *
 * `item_trade` 행이 해당 CM 방에 연결된 경우: **CM participant unread 만** 목록에 쓴다.
 * (레거시 미러·PC 카운트와 `max` 하면 읽음 후에도 유령 뱃지가 남는다.)
 * 연결 레코드가 없을 때만 PC 컬럼 등 레거시 힌트를 쓴다.
 *
 * HS5-RETRY: 꼬리 지연 — 동일 데이터를 `home_sync_hs5_unread_legacy_bundle` 단일 RPC 로 읽고,
 * 실패 시에만 기존 병렬 REST 폴백(의미론 동일).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { logHomeSyncBreakdown } from "@/lib/community-messenger/home-sync-breakdown-log";
import { messengerVerboseTraceConsoleEnabled } from "@/lib/community-messenger/messenger-trace-console";
import { homeSyncTraceMeterEnabled, ms, type HomeSyncDeepStepsUnreadBadge, type HomeSyncTrace } from "@/lib/community-messenger/home-sync-trace";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

function t(value: unknown): string {
  return String(value ?? "").trim();
}

function dedupeStrings(values: Iterable<string>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const v = t(raw);
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

/** HS5-RETRY: 관측 전용 행당 근사 바이트 (JSON 부하 추정) */
function estimateUnreadPayloadBytesApprox(chatRowCount: number, pcRowCount: number): number {
  return chatRowCount * 72 + pcRowCount * 140;
}

function readHs5RpcDebugNumber(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function readHs5RpcDebugInt(v: unknown): number | undefined {
  const n = readHs5RpcDebugNumber(v);
  if (n === undefined) return undefined;
  return Math.max(0, Math.floor(n));
}

type Hs5RpcDebugPayload = {
  rpc_total_ms?: unknown;
  rpc_chat_rooms_ms?: unknown;
  rpc_product_chats_ms?: unknown;
  rpc_merge_ms?: unknown;
  rpc_json_build_ms?: unknown;
  rpc_chat_rows_count?: unknown;
  rpc_product_rows_count?: unknown;
};

const HS5_LEGACY_ROW_CACHE_TTL_MS = 3_000;
const HS5_LEGACY_ROW_CACHE_MAX_KEYS = 500;

export type Hs5LegacyLoadResult = {
  itemTradeRows: unknown[];
  pcRows: unknown[];
  itErr: unknown | null;
  usedRpcBundle: boolean;
  dbRoundTrips: number;
  legacyChatRoomsFetchMs: number;
  legacyProductChatsFetchMs: number;
  unreadLegacyFetchPath: "rpc_bundle" | "parallel_rest";
  unreadRpcBundleMs: number;
  rpcDbgPayload?: Hs5RpcDebugPayload;
};

const hs5LegacyRowCache = new Map<string, { exp: number; payload: Hs5LegacyLoadResult }>();
const hs5LegacyInflight = new Map<string, Promise<Hs5LegacyLoadResult>>();

function pruneHs5LegacyRowCache(now: number): void {
  if (hs5LegacyRowCache.size <= HS5_LEGACY_ROW_CACHE_MAX_KEYS) return;
  for (const [k, v] of hs5LegacyRowCache) {
    if (v.exp < now || hs5LegacyRowCache.size <= HS5_LEGACY_ROW_CACHE_MAX_KEYS * 0.75) hs5LegacyRowCache.delete(k);
  }
}

function isTradeRoomSummaryForHs5(s: CommunityMessengerRoomSummary): boolean {
  if (s.contextMeta?.kind === "trade") return true;
  const dk = t(s.messengerDirectKey);
  return dk.startsWith("trade_pc:") || dk.startsWith("trade_item:");
}

function productChatIdForHs5Summary(s: CommunityMessengerRoomSummary): string {
  const fromMeta = t(s.contextMeta?.productChatId);
  if (fromMeta) return fromMeta;
  const dk = t(s.messengerDirectKey);
  if (dk.startsWith("trade_pc:")) return dk.slice("trade_pc:".length).trim();
  return "";
}

/** 동일 viewer·room·pc 집합 — critical HS5 RPC 재호출 방지(최대 3s stale 허용) */
function hs5LegacyCacheKeyByRoomSet(uid: string, cmRoomIds: string[], productChatIds: string[]): string {
  return `${uid}\0r:${[...cmRoomIds].sort().join(",")}\0p:${[...productChatIds].sort().join(",")}`;
}

/** @deprecated inflight dedupe — unread 시그니처 포함(비-critical 경로) */
function fingerprintHs5LegacyRows(uid: string, tradeSummaries: CommunityMessengerRoomSummary[]): string {
  const roomIds = [...new Set(tradeSummaries.map((s) => t(s.id)).filter(Boolean))].sort();
  const pcIds = [...new Set(tradeSummaries.map((s) => productChatIdForHs5Summary(s)).filter(Boolean))].sort();
  const unreadSig = tradeSummaries
    .map((s) => `${t(s.id)}:${Math.max(0, Math.floor(Number(s.unreadCount) || 0))}`)
    .sort()
    .join("|");
  return `${uid}\0${roomIds.join(",")}\0${pcIds.join(",")}\0${unreadSig}`;
}

/**
 * home-sync critical — `hydrateProfiles` 와 병렬로 HS5 RPC 행만 미리 가져온다(응답 의미 동일).
 */
export async function prefetchHs5LegacyUnreadRows(
  sbAny: SupabaseClient<any>,
  viewerUserId: string,
  cmRoomIds: string[],
  productChatIds: string[],
  homeSyncTrace?: HomeSyncTrace
): Promise<Hs5LegacyLoadResult | null> {
  const uid = t(viewerUserId);
  const rooms = dedupeStrings(cmRoomIds);
  if (!uid || !rooms.length) return null;

  const pcIds = dedupeStrings(productChatIds);
  const cacheKey = hs5LegacyCacheKeyByRoomSet(uid, rooms, pcIds);
  const clock = Date.now();
  const cached = hs5LegacyRowCache.get(cacheKey);
  if (cached && cached.exp >= clock) {
    console.log("[home-sync-unread-cache-hit]", {
      room_count: rooms.length,
      product_chat_count: pcIds.length,
      path: cached.payload.unreadLegacyFetchPath,
    });
    if (homeSyncTraceMeterEnabled(homeSyncTrace)) {
      const tr = homeSyncTrace!;
      tr.deepSteps.unreadHomeSyncSteps = {
        ...(tr.deepSteps.unreadHomeSyncSteps ?? {}),
        unreadCacheHit: true,
        unreadBootstrapCacheHit: 1,
        unreadBootstrapSkipReason: "hs5_row_ttl_cache_prefetch",
      };
    }
    return cached.payload;
  }

  const existingFlight = hs5LegacyInflight.get(cacheKey);
  if (existingFlight) {
    console.log("[home-sync-unread-cache-miss]", { reason: "inflight_join", room_count: rooms.length });
    return existingFlight;
  }

  console.log("[home-sync-unread-cache-miss]", { reason: "cold_or_ttl_expired", room_count: rooms.length });
  const flight = (async (): Promise<Hs5LegacyLoadResult> => {
    const got = await loadHs5LegacyRowsUncached(sbAny, rooms, pcIds);
    if (!got.itErr) {
      hs5LegacyRowCache.set(cacheKey, {
        exp: Date.now() + HS5_LEGACY_ROW_CACHE_TTL_MS,
        payload: {
          ...got,
          itemTradeRows: [...got.itemTradeRows],
          pcRows: [...got.pcRows],
        },
      });
      pruneHs5LegacyRowCache(Date.now());
    }
    return got;
  })();
  hs5LegacyInflight.set(cacheKey, flight);
  try {
    return await flight;
  } finally {
    hs5LegacyInflight.delete(cacheKey);
  }
}

async function loadHs5LegacyRowsUncached(
  sbAny: SupabaseClient<any>,
  cmRoomIds: string[],
  productChatIds: string[]
): Promise<Hs5LegacyLoadResult> {
  let itemTradeRows: unknown[] = [];
  let pcRows: unknown[] = [];
  let itErr: unknown | null = null;
  let legacyChatRoomsFetchMs = 0;
  let legacyProductChatsFetchMs = 0;
  let unreadLegacyFetchPath: "rpc_bundle" | "parallel_rest" = "parallel_rest";
  let unreadRpcBundleMs = 0;
  let rpcDbgPayload: Hs5RpcDebugPayload | undefined;
  let dbRoundTrips = 0;
  let usedRpcBundle = false;

  try {
    const tRpc = performance.now();
    const rpcRes = await sbAny.rpc("home_sync_hs5_unread_legacy_bundle", {
      p_cm_room_ids: cmRoomIds,
      p_pc_ids: productChatIds.length ? productChatIds : [],
    });
    const rpcWall = performance.now() - tRpc;
    if (!rpcRes.error && rpcRes.data != null) {
      const root = rpcRes.data as {
        chatRows?: unknown[];
        pcRows?: unknown[];
        _hs5RpcDebug?: Hs5RpcDebugPayload;
      };
      itemTradeRows = Array.isArray(root.chatRows) ? root.chatRows : [];
      pcRows = Array.isArray(root.pcRows) ? root.pcRows : [];
      rpcDbgPayload = root._hs5RpcDebug;
      usedRpcBundle = true;
      unreadLegacyFetchPath = "rpc_bundle";
      unreadRpcBundleMs = rpcWall;
      const dbg = root._hs5RpcDebug;
      const srvChat = dbg ? readHs5RpcDebugNumber(dbg.rpc_chat_rooms_ms) : undefined;
      const srvPc = dbg ? readHs5RpcDebugNumber(dbg.rpc_product_chats_ms) : undefined;
      legacyChatRoomsFetchMs = srvChat ?? rpcWall;
      legacyProductChatsFetchMs = srvPc ?? 0;
      dbRoundTrips += 1;
      logHomeSyncBreakdown("legacy_trade_hs5_unread_rpc_bundle", rpcWall, {
        rpc: "home_sync_hs5_unread_legacy_bundle",
        cmRoomIdCount: cmRoomIds.length,
        productChatIdCount: productChatIds.length,
        err: null,
        srvRpcTotalMs: dbg ? readHs5RpcDebugNumber(dbg.rpc_total_ms) : null,
        srvChatRoomsMs: srvChat ?? null,
        srvProductChatsMs: srvPc ?? null,
      });
    }
  } catch (rpcCatch) {
    if (process.env.NODE_ENV === "development" && messengerVerboseTraceConsoleEnabled()) {
      // eslint-disable-next-line no-console -- gated HS5 fallback diagnostic
      console.debug("[home-sync] HS5 unread RPC bundle failed — parallel REST fallback", rpcCatch);
    }
    usedRpcBundle = false;
  }

  if (!usedRpcBundle) {
    unreadLegacyFetchPath = "parallel_rest";
    unreadRpcBundleMs = 0;
    const [chatTimed, pcTimed] = await Promise.all([
      (async () => {
        const t0 = performance.now();
        const res = await sbAny
          .from("chat_rooms")
          .select("id, community_messenger_room_id")
          .eq("room_type", "item_trade")
          .in("community_messenger_room_id", cmRoomIds);
        return { res, elapsedMs: performance.now() - t0 };
      })(),
      productChatIds.length
        ? (async () => {
            const t0 = performance.now();
            const res = await sbAny
              .from("product_chats")
              .select("id, seller_id, buyer_id, unread_count_seller, unread_count_buyer")
              .in("id", productChatIds);
            return { res, elapsedMs: performance.now() - t0 };
          })()
        : Promise.resolve({
            res: { data: [] as unknown[], error: null as unknown },
            elapsedMs: 0,
          }),
    ]);
    const cr = chatTimed.res;
    itErr = cr.error;
    itemTradeRows = (cr.data ?? []) as unknown[];
    legacyChatRoomsFetchMs = chatTimed.elapsedMs;
    logHomeSyncBreakdown("legacy_trade_query_chat_rooms", legacyChatRoomsFetchMs, {
      table: "chat_rooms",
      roomIdInCount: cmRoomIds.length,
      err: itErr ? String((itErr as { message?: unknown }).message ?? itErr) : null,
    });
    dbRoundTrips += 1;

    const pcRes = pcTimed.res as { data: unknown[] | null; error?: unknown };
    const { data: pcData, error: pcErr } = pcRes;
    pcRows = (pcData ?? []) as unknown[];
    legacyProductChatsFetchMs = productChatIds.length ? pcTimed.elapsedMs : 0;
    if (productChatIds.length) {
      logHomeSyncBreakdown("legacy_trade_query_product_chats", legacyProductChatsFetchMs, {
        table: "product_chats",
        idInCount: productChatIds.length,
        err: pcErr ? String((pcErr as { message?: unknown }).message ?? pcErr) : null,
      });
      dbRoundTrips += 1;
    }
  }

  return {
    itemTradeRows,
    pcRows,
    itErr,
    usedRpcBundle,
    dbRoundTrips,
    legacyChatRoomsFetchMs,
    legacyProductChatsFetchMs,
    unreadLegacyFetchPath,
    unreadRpcBundleMs,
    rpcDbgPayload,
  };
}

export async function enrichMessengerTradeUnreadWithLegacyTrade(
  sbAny: SupabaseClient<any>,
  viewerUserId: string,
  summaries: CommunityMessengerRoomSummary[],
  /** 관측 전용 — 동작·합산 로직 불변 */
  metrics?: { dbRoundTrips: number },
  /** dev home-sync trace — 동작 불변, `deepSteps.unreadHomeSyncSteps` 만 병합 */
  homeSyncTrace?: HomeSyncTrace,
  opts?: { preloadedLegacy?: Hs5LegacyLoadResult | null }
): Promise<void> {
  const patchUnread = (p: Partial<HomeSyncDeepStepsUnreadBadge>) => {
    if (!homeSyncTraceMeterEnabled(homeSyncTrace)) return;
    const tr = homeSyncTrace!;
    tr.deepSteps.unreadHomeSyncSteps = {
      ...(tr.deepSteps.unreadHomeSyncSteps ?? {}),
      ...p,
    };
  };

  const uid = t(viewerUserId);
  if (homeSyncTraceMeterEnabled(homeSyncTrace)) {
    const tr = homeSyncTrace!;
    const prev = tr.deepSteps.unreadHomeSyncSteps?.enrichInvocationCount ?? 0;
    patchUnread({
      enrichInvocationCount: prev + 1,
      ownerHubBadgeMs: 0,
      unreadCacheHit: null,
    });
  }

  if (!uid || !summaries.length) {
    if (metrics) metrics.dbRoundTrips = 0;
    patchUnread({
      legacyChatRoomsFetchMs: 0,
      legacyProductChatsFetchMs: 0,
      unreadSourceFetchMs: 0,
      unreadParallelWallMs: 0,
      unreadEffectiveRttCount: 0,
      legacyTradeUnreadMs: 0,
      badgeAttachCpuMs: 0,
      roomIdDedupeMs: 0,
      unreadQueryCount: 0,
    });
    return;
  }

  const tDedupe = performance.now();
  const tradeSummaries = summaries.filter(isTradeRoomSummaryForHs5);
  const cmRoomIds = dedupeStrings(tradeSummaries.map((s) => s.id));
  const roomIdDedupeMs = performance.now() - tDedupe;
  patchUnread({ roomIdDedupeMs: ms(roomIdDedupeMs) });

  if (!tradeSummaries.length || !cmRoomIds.length) {
    if (metrics) metrics.dbRoundTrips = 0;
    patchUnread({
      legacyChatRoomsFetchMs: 0,
      legacyProductChatsFetchMs: 0,
      unreadSourceFetchMs: 0,
      unreadParallelWallMs: 0,
      unreadEffectiveRttCount: 0,
      legacyTradeUnreadMs: 0,
      badgeAttachCpuMs: 0,
      unreadQueryCount: 0,
    });
    return;
  }

  const productChatIds = dedupeStrings(tradeSummaries.map((s) => productChatIdForHs5Summary(s)).filter(Boolean));

  patchUnread({
    unreadRoomIdsCount: cmRoomIds.length,
    unreadProductChatIdsCount: productChatIds.length,
    unreadBootstrapTradeRoomRowsBeforeDedupe: tradeSummaries.length,
    unreadBootstrapDuplicateRooms: Math.max(0, tradeSummaries.length - cmRoomIds.length),
    unreadBootstrapRoomCount: cmRoomIds.length,
  });

  const roomSetKey = hs5LegacyCacheKeyByRoomSet(uid, cmRoomIds, productChatIds);
  const fp = fingerprintHs5LegacyRows(uid, tradeSummaries);
  const tWall = performance.now();
  let unreadBootstrapParallelWaitMsNum = 0;
  let unreadBootstrapCacheHit: 0 | 1 = 0;
  let unreadBootstrapCacheMissReason: string | undefined;
  let unreadBootstrapSkipReason: string | undefined;

  let itemTradeRows: unknown[] = [];
  let pcRows: unknown[] = [];
  let itErr: unknown | null = null;
  let legacyChatRoomsFetchMs = 0;
  let legacyProductChatsFetchMs = 0;
  let unreadLegacyFetchPath: "rpc_bundle" | "parallel_rest" = "parallel_rest";
  let unreadRpcBundleMs = 0;
  let rpcDbgPayload: Hs5RpcDebugPayload | undefined;
  let dbRoundTrips = 0;
  let usedRpcBundle = false;

  const preloaded = opts?.preloadedLegacy;
  if (preloaded) {
    itemTradeRows = preloaded.itemTradeRows;
    pcRows = preloaded.pcRows;
    itErr = preloaded.itErr;
    usedRpcBundle = preloaded.usedRpcBundle;
    dbRoundTrips = 0;
    legacyChatRoomsFetchMs = 0;
    legacyProductChatsFetchMs = 0;
    unreadLegacyFetchPath = preloaded.unreadLegacyFetchPath;
    unreadRpcBundleMs = 0;
    unreadBootstrapCacheHit = 1;
    unreadBootstrapSkipReason = "prefetch_parallel_apply";
    console.log("[home-sync-unread-cache-hit]", {
      room_count: cmRoomIds.length,
      product_chat_count: productChatIds.length,
      path: preloaded.unreadLegacyFetchPath,
      phase: "apply_preloaded",
    });
  }

  const clock = Date.now();
  const cached = !preloaded ? hs5LegacyRowCache.get(roomSetKey) : undefined;
  if (!preloaded && cached && cached.exp >= clock) {
    const pay = cached.payload;
    itemTradeRows = pay.itemTradeRows;
    pcRows = pay.pcRows;
    itErr = pay.itErr;
    usedRpcBundle = pay.usedRpcBundle;
    dbRoundTrips = 0;
    legacyChatRoomsFetchMs = 0;
    legacyProductChatsFetchMs = 0;
    unreadLegacyFetchPath = pay.unreadLegacyFetchPath;
    unreadRpcBundleMs = 0;
    rpcDbgPayload = undefined;
    unreadBootstrapCacheHit = 1;
    unreadBootstrapSkipReason = "hs5_row_ttl_cache";
    console.log("[home-sync-unread-cache-hit]", {
      room_count: cmRoomIds.length,
      product_chat_count: productChatIds.length,
      path: pay.unreadLegacyFetchPath,
    });
  } else if (!preloaded) {
    console.log("[home-sync-unread-cache-miss]", {
      reason: "cold_or_ttl_expired",
      room_count: cmRoomIds.length,
    });
    const existingFlight = hs5LegacyInflight.get(roomSetKey) ?? hs5LegacyInflight.get(fp);
    if (existingFlight) {
      unreadBootstrapCacheMissReason = "inflight_join";
      const tJoin = performance.now();
      const got = await existingFlight;
      unreadBootstrapParallelWaitMsNum = performance.now() - tJoin;
      itemTradeRows = got.itemTradeRows;
      pcRows = got.pcRows;
      itErr = got.itErr;
      usedRpcBundle = got.usedRpcBundle;
      dbRoundTrips = got.dbRoundTrips;
      legacyChatRoomsFetchMs = got.legacyChatRoomsFetchMs;
      legacyProductChatsFetchMs = got.legacyProductChatsFetchMs;
      unreadLegacyFetchPath = got.unreadLegacyFetchPath;
      unreadRpcBundleMs = got.unreadRpcBundleMs;
      rpcDbgPayload = got.rpcDbgPayload;
    } else {
      unreadBootstrapCacheMissReason = "cold_or_ttl_expired";
      const flight = (async (): Promise<Hs5LegacyLoadResult> => {
        const got = await loadHs5LegacyRowsUncached(sbAny, cmRoomIds, productChatIds);
        if (!got.itErr) {
          const snap = {
            exp: Date.now() + HS5_LEGACY_ROW_CACHE_TTL_MS,
            payload: {
              ...got,
              itemTradeRows: [...got.itemTradeRows],
              pcRows: [...got.pcRows],
            },
          };
          hs5LegacyRowCache.set(roomSetKey, snap);
          hs5LegacyRowCache.set(fp, snap);
          pruneHs5LegacyRowCache(Date.now());
        }
        return got;
      })();
      hs5LegacyInflight.set(roomSetKey, flight);
      try {
        const got = await flight;
        itemTradeRows = got.itemTradeRows;
        pcRows = got.pcRows;
        itErr = got.itErr;
        usedRpcBundle = got.usedRpcBundle;
        dbRoundTrips = got.dbRoundTrips;
        legacyChatRoomsFetchMs = got.legacyChatRoomsFetchMs;
        legacyProductChatsFetchMs = got.legacyProductChatsFetchMs;
        unreadLegacyFetchPath = got.unreadLegacyFetchPath;
        unreadRpcBundleMs = got.unreadRpcBundleMs;
        rpcDbgPayload = got.rpcDbgPayload;
      } finally {
        hs5LegacyInflight.delete(roomSetKey);
        hs5LegacyInflight.delete(fp);
      }
    }
  }

  const unreadParallelWallMs = performance.now() - tWall;

  const cMs = legacyChatRoomsFetchMs;
  const pMs = legacyProductChatsFetchMs;
  let unreadMaxSingleQueryMs = Math.max(cMs, pMs);
  let unreadSlowestQuery: string;
  if (usedRpcBundle && rpcDbgPayload) {
    const chatN = readHs5RpcDebugNumber(rpcDbgPayload.rpc_chat_rooms_ms) ?? 0;
    const pcN = readHs5RpcDebugNumber(rpcDbgPayload.rpc_product_chats_ms) ?? 0;
    const mergeN = readHs5RpcDebugNumber(rpcDbgPayload.rpc_merge_ms) ?? 0;
    const jsonN = readHs5RpcDebugNumber(rpcDbgPayload.rpc_json_build_ms) ?? 0;
    const segs: Array<[string, number]> = [
      ["rpc_chat_rooms", chatN],
      ["rpc_product_chats", pcN],
      ["rpc_merge", mergeN],
      ["rpc_json_build", jsonN],
    ];
    const top = segs.reduce((a, b) => (b[1] > a[1] ? b : a));
    unreadMaxSingleQueryMs = top[1];
    unreadSlowestQuery = top[0];
  } else if (usedRpcBundle) {
    unreadMaxSingleQueryMs = unreadRpcBundleMs;
    unreadSlowestQuery = "rpc_bundle";
  } else if (!productChatIds.length) {
    unreadSlowestQuery = "chat_rooms";
    unreadMaxSingleQueryMs = cMs;
  } else if (cMs > pMs) {
    unreadSlowestQuery = "chat_rooms";
  } else if (pMs > cMs) {
    unreadSlowestQuery = "product_chats";
  } else {
    unreadSlowestQuery = "both";
  }

  patchUnread({
    legacyChatRoomsFetchMs: ms(legacyChatRoomsFetchMs),
    legacyProductChatsFetchMs: ms(legacyProductChatsFetchMs),
    unreadSourceFetchMs: ms(unreadParallelWallMs),
    unreadParallelWallMs: ms(unreadParallelWallMs),
    unreadEffectiveRttCount: 1,
    unreadLegacyFetchPath,
    unreadRpcBundleMs: ms(unreadRpcBundleMs),
    unreadMaxSingleQueryMs: ms(unreadMaxSingleQueryMs),
    unreadSlowestQuery,
    unreadQueryCount: dbRoundTrips,
    ...(rpcDbgPayload
      ? (() => {
          const tot = readHs5RpcDebugNumber(rpcDbgPayload.rpc_total_ms);
          const chatCr = readHs5RpcDebugInt(rpcDbgPayload.rpc_chat_rows_count);
          const pcCr = readHs5RpcDebugInt(rpcDbgPayload.rpc_product_rows_count);
          const rpcRows = (chatCr ?? 0) + (pcCr ?? 0);
          const overhead =
            tot !== undefined ? Math.max(0, unreadRpcBundleMs - tot) : undefined;
          return {
            unreadRpcTotalMs: tot !== undefined ? ms(tot) : undefined,
            unreadRpcChatRoomsMs: ms(readHs5RpcDebugNumber(rpcDbgPayload.rpc_chat_rooms_ms) ?? 0),
            unreadRpcProductChatsMs: ms(readHs5RpcDebugNumber(rpcDbgPayload.rpc_product_chats_ms) ?? 0),
            unreadRpcMergeMs: ms(readHs5RpcDebugNumber(rpcDbgPayload.rpc_merge_ms) ?? 0),
            unreadRpcJsonBuildMs: ms(readHs5RpcDebugNumber(rpcDbgPayload.rpc_json_build_ms) ?? 0),
            unreadRpcRowsFetched: rpcRows,
            unreadRpcPayloadBytesEstimate: estimateUnreadPayloadBytesApprox(chatCr ?? 0, pcCr ?? 0),
            unreadRpcNetworkOverheadMs: overhead !== undefined ? ms(overhead) : undefined,
          };
        })()
      : {}),
    unreadBootstrapCacheHit,
    unreadBootstrapCacheMissReason,
    unreadBootstrapSkipReason,
    unreadBootstrapParallelWaitMs: ms(unreadBootstrapParallelWaitMsNum),
    unreadBootstrapRowsFetchMs: ms(unreadBootstrapCacheHit ? 0 : unreadParallelWallMs),
    unreadBootstrapCountQueryMs: 0,
    unreadBootstrapQueryCount: dbRoundTrips,
  });

  if (itErr) {
    if (metrics) metrics.dbRoundTrips = dbRoundTrips;
    patchUnread({
      legacyTradeUnreadMs: 0,
      badgeAttachCpuMs: 0,
      unreadMergeCpuMs: 0,
      unreadAttachCpuMs: 0,
      unreadQueryCount: dbRoundTrips,
    });
    return;
  }

  const tMerge = performance.now();
  const itemTradeByCmRoomId = new Map<string, true>();
  for (const row of itemTradeRows as Array<{
    id?: unknown;
    community_messenger_room_id?: unknown;
  }>) {
    const cmId = t(row.community_messenger_room_id);
    const id = t(row.id);
    if (!cmId || !id || itemTradeByCmRoomId.has(cmId)) continue;
    itemTradeByCmRoomId.set(cmId, true);
  }

  const pcById = new Map<
    string,
    { seller_id: string; buyer_id: string; unreadSeller: number; unreadBuyer: number }
  >();
  for (const row of pcRows as Array<{
    id?: unknown;
    seller_id?: unknown;
    buyer_id?: unknown;
    unread_count_seller?: unknown;
    unread_count_buyer?: unknown;
  }>) {
    const id = t(row.id);
    if (!id) continue;
    pcById.set(id, {
      seller_id: t(row.seller_id),
      buyer_id: t(row.buyer_id),
      unreadSeller: Math.max(0, Math.floor(Number(row.unread_count_seller ?? 0) || 0)),
      unreadBuyer: Math.max(0, Math.floor(Number(row.unread_count_buyer ?? 0) || 0)),
    });
  }
  const unreadMergeCpuMs = performance.now() - tMerge;
  patchUnread({
    legacyTradeUnreadMs: ms(unreadMergeCpuMs),
    unreadMergeCpuMs: ms(unreadMergeCpuMs),
  });

  const tAttach = performance.now();
  for (const s of tradeSummaries) {
    const cmU = Math.max(0, Math.floor(Number(s.unreadCount) || 0));
    const link = itemTradeByCmRoomId.get(s.id);
    if (link) {
      if (cmU !== s.unreadCount) {
        s.unreadCount = cmU;
      }
      continue;
    }

    let legacy = 0;
    const pcid = productChatIdForHs5Summary(s);
    const pc = pcid ? pcById.get(pcid) : undefined;
    if (pc) {
      const amSeller = pc.seller_id === uid;
      legacy = Math.max(0, amSeller ? pc.unreadSeller : pc.unreadBuyer);
    }

    const merged = Math.max(cmU, legacy);
    if (merged !== s.unreadCount) {
      s.unreadCount = merged;
    }
  }
  const unreadAttachCpuMs = performance.now() - tAttach;
  const rowsFetched = itemTradeRows.length + pcRows.length;
  const cpuMergeBootstrap = unreadMergeCpuMs + unreadAttachCpuMs + roomIdDedupeMs;
  const rowsFetchWall = unreadBootstrapCacheHit ? 0 : unreadParallelWallMs;
  const bootBottleneckCandidates: Array<[string, number]> = [
    ["unread_bootstrap_rows_fetch", rowsFetchWall],
    ["unread_bootstrap_cpu_merge", cpuMergeBootstrap],
    ["unread_bootstrap_inflight_wait", unreadBootstrapParallelWaitMsNum],
  ];
  let bootTop = bootBottleneckCandidates[0];
  for (const c of bootBottleneckCandidates) {
    if (c[1] > bootTop[1]) bootTop = c;
  }
  patchUnread({
    badgeAttachCpuMs: ms(unreadAttachCpuMs),
    unreadAttachCpuMs: ms(unreadAttachCpuMs),
    unreadRowsFetched: rowsFetched,
    unreadPayloadBytesEstimate: estimateUnreadPayloadBytesApprox(itemTradeRows.length, pcRows.length),
    unreadQueryCount: dbRoundTrips,
    unreadBootstrapCpuMergeMs: ms(cpuMergeBootstrap),
    unreadBootstrapRowsFetchMs: ms(rowsFetchWall),
    unreadBootstrapCountQueryMs: 0,
    unreadBootstrapTopBottleneck: bootTop[0],
  });

  if (metrics) metrics.dbRoundTrips = dbRoundTrips;
}
