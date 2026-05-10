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
import { ms, type HomeSyncDeepStepsUnreadBadge, type HomeSyncTrace } from "@/lib/community-messenger/home-sync-trace";
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

export async function enrichMessengerTradeUnreadWithLegacyTrade(
  sbAny: SupabaseClient<any>,
  viewerUserId: string,
  summaries: CommunityMessengerRoomSummary[],
  /** 관측 전용 — 동작·합산 로직 불변 */
  metrics?: { dbRoundTrips: number },
  /** dev home-sync trace — 동작 불변, `deepSteps.unreadHomeSyncSteps` 만 병합 */
  homeSyncTrace?: HomeSyncTrace
): Promise<void> {
  const patchUnread = (p: Partial<HomeSyncDeepStepsUnreadBadge>) => {
    if (!homeSyncTrace?.token) return;
    homeSyncTrace.deepSteps.unreadHomeSyncSteps = {
      ...(homeSyncTrace.deepSteps.unreadHomeSyncSteps ?? {}),
      ...p,
    };
  };

  const uid = t(viewerUserId);
  if (homeSyncTrace?.token) {
    const prev = homeSyncTrace.deepSteps.unreadHomeSyncSteps?.enrichInvocationCount ?? 0;
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
    });
    return;
  }

  const tDedupe = performance.now();
  const tradeSummaries = summaries.filter((s) => s.contextMeta?.kind === "trade");
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
    });
    return;
  }

  let dbRoundTrips = 0;

  const productChatIds = dedupeStrings(
    tradeSummaries.map((s) => t(s.contextMeta?.productChatId)).filter(Boolean)
  );

  patchUnread({
    unreadRoomIdsCount: cmRoomIds.length,
    unreadProductChatIdsCount: productChatIds.length,
  });

  let itemTradeRows: unknown[] = [];
  let pcRows: unknown[] = [];
  let itErr: unknown = null;
  let legacyChatRoomsFetchMs = 0;
  let legacyProductChatsFetchMs = 0;
  let unreadLegacyFetchPath: "rpc_bundle" | "parallel_rest" = "parallel_rest";
  let unreadRpcBundleMs = 0;
  /** HS5-RPC-DEEP: 서버 `_hs5RpcDebug` — 패치 구간에서만 유효 */
  let rpcDbgPayload: Hs5RpcDebugPayload | undefined;

  const tWall = performance.now();
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
    if (process.env.NODE_ENV === "development") {
      console.warn("[home-sync] HS5 unread RPC bundle failed — parallel REST fallback", rpcCatch);
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
  });

  if (itErr) {
    if (metrics) metrics.dbRoundTrips = dbRoundTrips;
    patchUnread({
      legacyTradeUnreadMs: 0,
      badgeAttachCpuMs: 0,
      unreadMergeCpuMs: 0,
      unreadAttachCpuMs: 0,
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
    const pcid = t(s.contextMeta?.productChatId);
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
  patchUnread({
    badgeAttachCpuMs: ms(unreadAttachCpuMs),
    unreadAttachCpuMs: ms(unreadAttachCpuMs),
    unreadRowsFetched: rowsFetched,
    unreadPayloadBytesEstimate: estimateUnreadPayloadBytesApprox(itemTradeRows.length, pcRows.length),
  });

  if (metrics) metrics.dbRoundTrips = dbRoundTrips;
}
