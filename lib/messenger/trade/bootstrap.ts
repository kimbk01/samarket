/**
 * trade BootstrapPort — trade only. partial 은 trade snapshot 만 merge.
 */
import { buildTradeListSnapshot } from "@/lib/messenger/trade/list";
import { TRADE_DOMAIN, type TradeListItem, type TradeRoomInput } from "@/lib/messenger/trade/types";

export type TradeBootstrapMode = "full" | "partial";

export type TradeBootstrapSnapshot = Readonly<{
  domain: typeof TRADE_DOMAIN;
  viewerUserId: string;
  generation: string;
  mode: TradeBootstrapMode;
  rows: ReadonlyArray<TradeListItem>;
}>;

export type TradeBootstrapResult =
  | { ok: true; snapshot: TradeBootstrapSnapshot }
  | { ok: false; error: string };

export function acceptTradeBootstrap(input: {
  viewerUserId: string;
  generation: string;
  mode: TradeBootstrapMode;
  rooms: ReadonlyArray<TradeRoomInput>;
}): TradeBootstrapResult {
  const listed = buildTradeListSnapshot({
    viewerUserId: input.viewerUserId,
    generation: input.generation,
    rooms: input.rooms,
  });
  if (!listed.ok) return listed;
  return {
    ok: true,
    snapshot: {
      domain: TRADE_DOMAIN,
      viewerUserId: listed.snapshot.viewerUserId,
      generation: listed.snapshot.generation,
      mode: input.mode,
      rows: listed.snapshot.rows,
    },
  };
}

export function mergeTradePartialBootstrap(
  previous: TradeBootstrapSnapshot,
  patch: { generation: string; rooms: ReadonlyArray<TradeRoomInput> }
): TradeBootstrapResult {
  if (previous.domain !== TRADE_DOMAIN) {
    return { ok: false, error: "dibay_trade_bootstrap_domain_mismatch" };
  }
  const accepted = acceptTradeBootstrap({
    viewerUserId: previous.viewerUserId,
    generation: patch.generation,
    mode: "partial",
    rooms: patch.rooms,
  });
  if (!accepted.ok) return accepted;
  const byId = new Map(previous.rows.map((r) => [r.roomId, r]));
  for (const row of accepted.snapshot.rows) {
    byId.set(row.roomId, { ...row, generation: patch.generation });
  }
  return {
    ok: true,
    snapshot: {
      domain: TRADE_DOMAIN,
      viewerUserId: previous.viewerUserId,
      generation: patch.generation,
      mode: "partial",
      rows: [...byId.values()],
    },
  };
}
