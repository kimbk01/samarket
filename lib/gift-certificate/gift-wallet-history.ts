/**
 * 회원 상품권 지갑 내역 — 「사용 완료」·「보낸 선물」 서버 쪽 이동(offset·limit·total) + 기간 합계
 * (C-4 · Owner 2026-11-03 「페이지 이동·날짜 명확 · 계산된 내용이 나오는 구조」).
 *
 * - 기간 = PHT 날짜 → UTC `[fromIso, toIso)` (`resolvePointHistoryPeriod` 와 같은 규칙).
 *   사용 완료 목록 = 다 쓴 날(`fully_redeemed_at`), 보낸 선물 목록 = 보낸 날(`created_at`).
 * - 기간 합계 (서버가 기간 **전체** 행으로 계산 · 현재 쪽 합계 아님):
 *   구매 = 내가 산 상품권(`purchased_at`) · 사용 = 내 사용 기록(되돌리지 않은 `redemptions`, `created_at`) ·
 *   받은 선물 = 내가 받아 수령 완료한 선물(보낸 날) · 보낸 선물 = 내가 보내 상대가 받은 선물(보낸 날). 금액 = 페소(₱).
 * - 주소 상태: 포인트 화면과 같은 키(`period`·`pfrom`·`pto`·`page`). 단 상품권 기본 기간은 **전체**
 *   (탭 건수 배지가 전체 건수라 목록과 맞춘다) → 이번 달은 `period=this_month` 로 적는다.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { GIFT_TABLES } from "@/lib/gift-certificate/gift-certificate-schema";
import {
  attachRedemptionSummaries,
  enrichTransferRows,
  mapInstance,
  mapTransfer,
  type GiftWalletInstance,
  type GiftWalletTransfer,
} from "@/lib/gift-certificate/load-gift-wallet";
import type { MePointsPeriodQuery } from "@/lib/points/me-points-client";
import { isValidPointsDay } from "@/lib/points/points-screen-url-state";
import {
  STORE_COMMISSION_PARSE_PERIODS,
  type StoreCommissionPeriod,
} from "@/lib/stores/commission/store-commission-ledger-query";

export const GIFT_HISTORY_PAGE_SIZE = 20;
export const GIFT_HISTORY_MAX_LIMIT = 100;
export const GIFT_HISTORY_SUMMARY_CAP = 5000;

export type GiftHistoryKind = "used" | "sent";

export function parseGiftHistoryKind(raw: string | null | undefined): GiftHistoryKind | null {
  return raw === "used" || raw === "sent" ? raw : null;
}

/* ───────── 주소 상태 (기본 = 전체) ───────── */

export type GiftHistoryUrlState = { period: MePointsPeriodQuery; page: number };

export function parseGiftHistoryUrlState(sp: Pick<URLSearchParams, "get">): GiftHistoryUrlState {
  const raw = String(sp.get("period") ?? "").trim();
  const period = (STORE_COMMISSION_PARSE_PERIODS as readonly string[]).includes(raw)
    ? (raw as StoreCommissionPeriod)
    : "all";
  const fromDay = String(sp.get("pfrom") ?? "").trim();
  const toDay = String(sp.get("pto") ?? "").trim();
  const n = Math.trunc(Number(sp.get("page") ?? ""));
  return {
    period:
      period === "custom"
        ? { period: "custom", fromDay: isValidPointsDay(fromDay) ? fromDay : "", toDay: isValidPointsDay(toDay) ? toDay : "" }
        : { period },
    page: Number.isFinite(n) && n >= 1 ? n - 1 : 0,
  };
}

/** 현재 쿼리(다른 키 보존) + 상태 → 새 쿼리(`?` 제외). 전체 기간·1쪽은 키를 지운다. */
export function writeGiftHistoryUrlState(search: string, state: GiftHistoryUrlState): string {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  for (const k of ["period", "pfrom", "pto", "page"]) params.delete(k);
  if (state.period.period !== "all") params.set("period", state.period.period);
  if (state.period.period === "custom") {
    if (state.period.fromDay) params.set("pfrom", state.period.fromDay);
    if (state.period.toDay) params.set("pto", state.period.toDay);
  }
  if (state.page > 0) params.set("page", String(state.page + 1));
  return params.toString();
}

/* ───────── 기간 합계 ───────── */

export type GiftAmountTotal = { count: number; amount: number };

export type GiftWalletPeriodSummary = {
  /** 구매 — 결제 금액(purchase_price) 합 */
  purchased: GiftAmountTotal;
  /** 사용 — 실제 적용 금액(redeemed_amount) 합 */
  used: GiftAmountTotal;
  /** 사용 때 소멸한 금액(forfeited_amount) 합 — 0 이면 화면에서 숨김 */
  forfeited: number;
  /** 받은 선물(수령 완료) — 액면가 합 */
  received: GiftAmountTotal;
  /** 보낸 선물(상대 수령 완료) — 액면가 합 */
  sent: GiftAmountTotal;
  capped: boolean;
  cap: number;
};

type Num = number | string | null | undefined;

function int(v: Num): number {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

export function summarizeGiftWalletPeriod(input: {
  purchases: ReadonlyArray<{ purchase_price?: Num }>;
  redemptions: ReadonlyArray<{ redeemed_amount?: Num; forfeited_amount?: Num }>;
  receivedTransfers: ReadonlyArray<{ instance_id?: string | null }>;
  sentTransfers: ReadonlyArray<{ instance_id?: string | null }>;
  faceValueByInstanceId: ReadonlyMap<string, number>;
  capped?: boolean;
  cap?: number;
}): GiftWalletPeriodSummary {
  const face = (rows: ReadonlyArray<{ instance_id?: string | null }>): GiftAmountTotal => ({
    count: rows.length,
    amount: rows.reduce((s, r) => s + int(input.faceValueByInstanceId.get(String(r.instance_id ?? "")) ?? 0), 0),
  });
  return {
    purchased: {
      count: input.purchases.length,
      amount: input.purchases.reduce((s, r) => s + int(r.purchase_price), 0),
    },
    used: {
      count: input.redemptions.length,
      amount: input.redemptions.reduce((s, r) => s + int(r.redeemed_amount), 0),
    },
    forfeited: input.redemptions.reduce((s, r) => s + int(r.forfeited_amount), 0),
    received: face(input.receivedTransfers),
    sent: face(input.sentTransfers),
    capped: input.capped === true,
    cap: input.cap ?? GIFT_HISTORY_SUMMARY_CAP,
  };
}

/** 쪽 요청 값 정리 */
export function parseGiftHistoryPageParams(sp: Pick<URLSearchParams, "get">): { offset: number; limit: number } {
  const offset = Math.max(0, Math.trunc(Number(sp.get("offset") ?? 0)) || 0);
  const l = Math.trunc(Number(sp.get("limit") ?? GIFT_HISTORY_PAGE_SIZE));
  const limit = Math.min(GIFT_HISTORY_MAX_LIMIT, Math.max(1, Number.isFinite(l) && l > 0 ? l : GIFT_HISTORY_PAGE_SIZE));
  return { offset, limit };
}

/* ───────── 서버 조회 ───────── */

const INSTANCE_SELECT =
  "id, public_gift_number, product_id, store_id, gift_scope, face_value, purchase_price, remaining_balance, status, purchased_at, created_at, fully_redeemed_at, valid_from, valid_until, gift_certificate_products(title, image_url, transferable, gift_scope, stores(store_name, profile_image_url))";
const TRANSFER_SELECT = "id, instance_id, sender_user_id, recipient_user_id, room_id, status, created_at, resolved_at";
/** 「보낸 선물」 탭과 같은 상태 집합 (`loadGiftWallet.sentTransfers`) */
const SENT_STATUSES = ["PENDING", "ACCEPTED", "REJECTED", "CANCELLED"];

export type GiftHistoryPage =
  | { kind: "used"; items: GiftWalletInstance[]; total: number; offset: number; limit: number }
  | { kind: "sent"; items: GiftWalletTransfer[]; total: number; offset: number; limit: number };

type Range = { fromIso: string | null; toIso: string | null };

export async function loadGiftHistoryPage(
  sb: SupabaseClient,
  input: { userId: string; kind: GiftHistoryKind; offset: number; limit: number } & Range
): Promise<{ ok: true; page: GiftHistoryPage } | { ok: false; error: string }> {
  const uid = input.userId.trim();
  if (!uid) return { ok: false, error: "missing_user" };
  const end = input.offset + input.limit - 1;
  if (input.kind === "used") {
    let q = sb
      .from(GIFT_TABLES.instances)
      .select(INSTANCE_SELECT, { count: "exact" })
      .eq("current_owner_user_id", uid)
      .eq("status", "FULLY_REDEEMED");
    if (input.fromIso) q = q.gte("fully_redeemed_at", input.fromIso);
    if (input.toIso) q = q.lt("fully_redeemed_at", input.toIso);
    const res = await q
      .order("fully_redeemed_at", { ascending: false })
      .order("id", { ascending: false })
      .range(input.offset, end);
    if (res.error) return { ok: false, error: res.error.message };
    const mapped = (res.data ?? []).map((r) => mapInstance(r as Record<string, unknown>));
    const items = await attachRedemptionSummaries(sb, mapped);
    return {
      ok: true,
      page: { kind: "used", items, total: res.count ?? items.length, offset: input.offset, limit: input.limit },
    };
  }
  let q = sb
    .from(GIFT_TABLES.transfers)
    .select(TRANSFER_SELECT, { count: "exact" })
    .eq("sender_user_id", uid)
    .in("status", SENT_STATUSES);
  if (input.fromIso) q = q.gte("created_at", input.fromIso);
  if (input.toIso) q = q.lt("created_at", input.toIso);
  const res = await q
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(input.offset, end);
  if (res.error) return { ok: false, error: res.error.message };
  const items = await enrichTransferRows(
    sb,
    (res.data ?? []).map((r) => mapTransfer(r as Record<string, unknown>))
  );
  return {
    ok: true,
    page: { kind: "sent", items, total: res.count ?? items.length, offset: input.offset, limit: input.limit },
  };
}

export async function loadGiftWalletPeriodSummary(
  sb: SupabaseClient,
  input: { userId: string } & Range
): Promise<{ ok: true; summary: GiftWalletPeriodSummary } | { ok: false; error: string }> {
  const uid = input.userId.trim();
  if (!uid) return { ok: false, error: "missing_user" };
  const cap = GIFT_HISTORY_SUMMARY_CAP;
  const inRange = <T extends { gte: (c: string, v: string) => T; lt: (c: string, v: string) => T }>(q: T, col: string): T => {
    let out = q;
    if (input.fromIso) out = out.gte(col, input.fromIso);
    if (input.toIso) out = out.lt(col, input.toIso);
    return out;
  };
  const [purRes, redRes, recvRes, sentRes] = await Promise.all([
    inRange(
      sb.from(GIFT_TABLES.instances).select("purchase_price", { count: "exact" }).eq("purchaser_user_id", uid),
      "purchased_at"
    ).limit(cap),
    inRange(
      sb
        .from(GIFT_TABLES.redemptions)
        .select("redeemed_amount, forfeited_amount", { count: "exact" })
        .eq("buyer_user_id", uid)
        .eq("reversed", false),
      "created_at"
    ).limit(cap),
    inRange(
      sb
        .from(GIFT_TABLES.transfers)
        .select("instance_id", { count: "exact" })
        .eq("recipient_user_id", uid)
        .eq("status", "ACCEPTED"),
      "created_at"
    ).limit(cap),
    inRange(
      sb
        .from(GIFT_TABLES.transfers)
        .select("instance_id", { count: "exact" })
        .eq("sender_user_id", uid)
        .eq("status", "ACCEPTED"),
      "created_at"
    ).limit(cap),
  ]);
  for (const r of [purRes, redRes, recvRes, sentRes]) {
    if (r.error) return { ok: false, error: r.error.message };
  }
  const receivedTransfers = (recvRes.data ?? []) as Array<{ instance_id?: string | null }>;
  const sentTransfers = (sentRes.data ?? []) as Array<{ instance_id?: string | null }>;
  const instanceIds = [
    ...new Set([...receivedTransfers, ...sentTransfers].map((r) => String(r.instance_id ?? "")).filter(Boolean)),
  ];
  const faceValueByInstanceId = new Map<string, number>();
  for (let i = 0; i < instanceIds.length; i += 200) {
    const chunk = instanceIds.slice(i, i + 200);
    const fr = await sb.from(GIFT_TABLES.instances).select("id, face_value").in("id", chunk);
    if (fr.error) return { ok: false, error: fr.error.message };
    for (const row of (fr.data ?? []) as Array<{ id: string; face_value: Num }>) {
      faceValueByInstanceId.set(String(row.id), int(row.face_value));
    }
  }
  const capped = [purRes, redRes, recvRes, sentRes].some((r) => (r.count ?? 0) > (r.data ?? []).length);
  return {
    ok: true,
    summary: summarizeGiftWalletPeriod({
      purchases: (purRes.data ?? []) as Array<{ purchase_price?: Num }>,
      redemptions: (redRes.data ?? []) as Array<{ redeemed_amount?: Num; forfeited_amount?: Num }>,
      receivedTransfers,
      sentTransfers,
      faceValueByInstanceId,
      capped,
      cap,
    }),
  };
}
