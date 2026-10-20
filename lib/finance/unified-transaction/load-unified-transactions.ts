/**
 * Load unified transactions from canonical ledgers only.
 *
 * R7 — 현금·코인·포인트 세 원장을 원장별 최신 N건씩 읽어 메모리에서 합치고 자르던 경로를 없앴다.
 * RPC `admin_finance_unified_tx_page` 가 DB 에서 한 번에 합쳐 필터·결정적 정렬(created_at DESC, wallet, id DESC)·
 * limit/offset 과 정확한 total 을 돌려준다 (supabase/migrations/20270601120100_r7_admin_finance_pages.sql).
 * 필터 규칙(매장=현금·코인, 회원=포인트, 주문·유형·방향·광고·기간)과 포인트 화면 유형(POINT_*)은 SQL 이 단일 정의다.
 * 읽기 전용 — 원장 쓰기 없음.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FinanceUnifiedTx, FinanceUnifiedTxQuery } from "@/lib/finance/unified-transaction/types";
import {
  BUSINESS_CASH_LEDGER_TABLE,
  STORE_ECONOMIC_POINT_LEDGER_TABLE,
} from "@/lib/stores/advertising/canonical-business-cash-contract";
import { ADMIN_LIST_MAX_OFFSET } from "@/lib/admin/pagination/parse-admin-list-page";

export const ADMIN_FINANCE_UNIFIED_TX_PAGE_RPC = "admin_finance_unified_tx_page" as const;
/** 한 페이지 최대 건수 (전체 결과는 total + offset 으로 끝까지 넘긴다). */
export const FINANCE_UNIFIED_TX_MAX_LIMIT = 100;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function asMeta(v: unknown): Record<string, unknown> {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  return {};
}

function uuidOrNull(v: string | null | undefined): string | null {
  const s = String(v ?? "").trim();
  return UUID_RE.test(s) ? s : null;
}

/** 형식이 틀린 id 필터 = 어떤 행과도 맞지 않는 값 (예전 eq 필터가 그 원장만 0건이던 결과와 같다). */
const NO_MATCH_UUID = "00000000-0000-0000-0000-000000000000";
function uuidFilter(v: string | null | undefined): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  return uuidOrNull(s) ?? NO_MATCH_UUID;
}

type RpcTxRow = {
  wallet?: string;
  id?: string;
  created_at?: string;
  entry_kind?: string;
  direction?: string;
  ad_id?: string | null;
  row?: Record<string, unknown>;
};

export type FinanceUnifiedTxPageQuery = FinanceUnifiedTxQuery & {
  offset?: number;
  /** 상세 1건 (txKey 의 id) */
  txId?: string | null;
};

export function unifiedTxPageRpcArgs(query: FinanceUnifiedTxPageQuery) {
  const limit = Math.min(Math.max(Math.trunc(Number(query.limit) || 80), 1), FINANCE_UNIFIED_TX_MAX_LIMIT);
  const offset = Math.min(Math.max(Math.trunc(Number(query.offset) || 0), 0), ADMIN_LIST_MAX_OFFSET);
  return {
    args: {
      p_wallet: query.wallet ?? null,
      p_type: query.type?.trim() || null,
      p_direction: query.direction === "credit" || query.direction === "debit" ? query.direction : null,
      p_store_id: uuidFilter(query.storeId),
      p_order_id: query.orderId?.trim() || null,
      p_ad_id: query.adId?.trim() || null,
      p_member_id: uuidFilter(query.memberId),
      p_from: query.fromIso || null,
      p_to: query.toIso || null,
      p_tx_id: uuidFilter(query.txId),
      p_limit: limit,
      p_offset: offset,
    },
    limit,
    offset,
  };
}

function mapRpcTxRow(r: RpcTxRow, orderIdQuery: string | null): FinanceUnifiedTx | null {
  const row = r.row ?? {};
  const id = String(r.id ?? row.id ?? "");
  if (!id) return null;
  const wallet = String(r.wallet ?? "");
  const entryKind = String(r.entry_kind ?? row.entry_kind ?? "");
  const direction: FinanceUnifiedTx["direction"] = r.direction === "credit" ? "credit" : "debit";
  const adId = r.ad_id == null || r.ad_id === "" ? null : String(r.ad_id);
  const relatedId = String(row.related_id ?? "");
  const occurredAt = String(r.created_at ?? row.created_at ?? "");

  if (wallet === "CASH") {
    const minor = Math.trunc(Number(row.amount_minor) || 0);
    const relatedType = String(row.related_type ?? "");
    const rt = relatedType.toLowerCase();
    const ek = entryKind.toUpperCase();
    const orderLinked =
      Boolean(relatedId) &&
      (ek.includes("SALE_FEE") ||
        ek.includes("SALE_EARN") ||
        rt.includes("order") ||
        rt.includes("sale_fee") ||
        rt.includes("settlement") ||
        (Boolean(orderIdQuery) && relatedId.includes(String(orderIdQuery))));
    return {
      id,
      txKey: `cash:${id}`,
      occurredAt,
      wallet: "CASH",
      entryKind,
      direction,
      amount: minor / 100,
      amountMinor: minor,
      balanceAfter: null,
      balanceAfterMinor: Math.trunc(Number(row.balance_after_minor) || 0),
      storeId: row.store_id == null ? null : String(row.store_id),
      storeName: null,
      ownerId: row.actor_user_id == null ? null : String(row.actor_user_id),
      memberId: null,
      memberLabel: null,
      orderId: orderLinked ? relatedId : null,
      adId,
      status: null,
      relatedType: relatedType || null,
      relatedId: relatedId || null,
      sourceTable: BUSINESS_CASH_LEDGER_TABLE,
      meta: asMeta(row.meta),
    };
  }

  if (wallet === "COIN") {
    const amt = Math.trunc(Number(row.amount) || 0);
    const meta = asMeta(row.meta);
    const orderFromMeta = meta.order_id == null ? null : String(meta.order_id).trim() || null;
    return {
      id,
      txKey: `coin:${id}`,
      occurredAt,
      wallet: "COIN",
      entryKind,
      direction,
      amount: Math.abs(amt),
      amountMinor: null,
      balanceAfter: Math.trunc(Number(row.balance_after) || 0),
      balanceAfterMinor: null,
      storeId: row.store_id == null ? null : String(row.store_id),
      storeName: null,
      ownerId: row.actor_user_id == null ? null : String(row.actor_user_id),
      memberId: null,
      memberLabel: null,
      orderId: relatedId || orderFromMeta,
      adId: null,
      status: null,
      relatedType: row.related_type == null ? null : String(row.related_type),
      relatedId: relatedId || null,
      sourceTable: STORE_ECONOMIC_POINT_LEDGER_TABLE,
      meta,
    };
  }

  if (wallet === "POINT") {
    const delta = Math.trunc(Number(row.amount) || 0);
    const entryType = String(row.entry_type ?? "");
    const relatedType = String(row.related_type ?? "");
    return {
      id,
      txKey: `point:${id}`,
      occurredAt,
      wallet: "POINT",
      entryKind,
      direction,
      amount: Math.abs(delta),
      amountMinor: null,
      balanceAfter: Math.trunc(Number(row.balance_after) || 0),
      balanceAfterMinor: null,
      storeId: null,
      storeName: null,
      ownerId: null,
      memberId: row.user_id == null ? null : String(row.user_id),
      memberLabel: null,
      orderId: null,
      adId,
      status: null,
      relatedType: relatedType || entryType || null,
      relatedId: relatedId || null,
      sourceTable: "point_ledger",
      meta: { description: String(row.description ?? ""), entry_type: entryType },
    };
  }
  return null;
}

/** 통합 거래 서버 페이지 — rows + 정확한 total. 실패는 예외 (빈 목록으로 오인 방지). */
export async function loadUnifiedFinanceTransactionPage(
  sb: SupabaseClient,
  query: FinanceUnifiedTxPageQuery = {}
): Promise<{ rows: FinanceUnifiedTx[]; total: number; limit: number; offset: number }> {
  const { args, limit, offset } = unifiedTxPageRpcArgs(query);
  // 해석할 수 없는 기간 값 — 예전 조회도 오류로 0건이었다. DB 형 변환 오류(500) 대신 빈 페이지.
  for (const t of [args.p_from, args.p_to]) {
    if (t && !Number.isFinite(Date.parse(t))) return { rows: [], total: 0, limit, offset };
  }
  const { data, error } = await sb.rpc(ADMIN_FINANCE_UNIFIED_TX_PAGE_RPC, args);
  if (error) throw new Error(error.message || "finance_transactions_load_failed");
  const o = (data ?? {}) as { total?: unknown; rows?: unknown };
  const raw = Array.isArray(o.rows) ? (o.rows as RpcTxRow[]) : [];
  const orderIdQuery = query.orderId?.trim() || null;
  const rows = raw.map((r) => mapRpcTxRow(r, orderIdQuery)).filter((r): r is FinanceUnifiedTx => Boolean(r));

  // 매장 이름 — 이 페이지 행의 매장만 (최대 100개 id).
  const storeIds = Array.from(new Set(rows.map((r) => r.storeId).filter(Boolean))) as string[];
  if (storeIds.length > 0) {
    const { data: stores } = await sb.from("stores").select("id, store_name").in("id", storeIds);
    const nameById = new Map(
      ((stores ?? []) as Array<{ id: string; store_name?: string }>).map((s) => [s.id, String(s.store_name ?? "")])
    );
    for (const row of rows) {
      if (row.storeId) row.storeName = nameById.get(row.storeId) ?? null;
    }
  }

  return { rows, total: Math.max(0, Math.trunc(Number(o.total) || 0)), limit, offset };
}

/** 예전 호출 호환 — 첫 페이지 행만 (limit ≤ 100). */
export async function loadUnifiedFinanceTransactions(
  sb: SupabaseClient,
  query: FinanceUnifiedTxQuery = {}
): Promise<FinanceUnifiedTx[]> {
  const page = await loadUnifiedFinanceTransactionPage(sb, query);
  return page.rows;
}

/** 상세 1건 — txKey(`cash:`·`coin:`·`point:` + id) 로 해당 원장에서 직접 찾는다 (최근 N건 안에서 찾지 않음). */
export async function loadUnifiedFinanceTransactionByKey(
  sb: SupabaseClient,
  txKey: string
): Promise<FinanceUnifiedTx | null> {
  const key = txKey.trim();
  const [kind, id] = key.split(":");
  if (!kind || !id) return null;
  const wallet = kind === "cash" ? "CASH" : kind === "coin" ? "COIN" : kind === "point" ? "POINT" : null;
  if (!wallet || !uuidOrNull(id)) return null;
  const page = await loadUnifiedFinanceTransactionPage(sb, { wallet, txId: id, limit: 1 });
  return page.rows.find((r) => r.id === id) ?? null;
}
