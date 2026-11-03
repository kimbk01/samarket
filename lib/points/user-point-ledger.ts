/**
 * CONTRACT (Phase 4 Slice 2 — Member ledger-only):
 * - SSOT = point_ledger (SUM(amount))
 * - profiles.points = projected cache only
 * - TS may UPDATE profiles.points ONLY via projectUserPointBalanceFromLedger
 * - DO NOT write profiles.points from spend/credit/expire/adjust/trade-ads directly
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PointLedgerActorType, PointLedgerEntryType, PointLedgerRelatedType } from "@/lib/types/point";
import { isMissingPointsTable } from "@/lib/points/admin-user-points-shared";

export type SpendUserPointsInput = {
  userId: string;
  amount: number;
  entryType: PointLedgerEntryType;
  relatedType: PointLedgerRelatedType;
  relatedId: string;
  description: string;
  actorType: PointLedgerActorType;
};

export type PointLedgerMutationResult =
  | { ok: true; balanceAfter: number; ledgerId?: string; duplicate?: true }
  | { ok: false; error: string; code?: "insufficient_balance" | "table_missing" | "duplicate" };

/**
 * Hold release / refund 1회 보장 unique index (DB migration).
 * 이 인덱스로 인한 23505 만 "이미 처리됨" 으로 간주 — 다른 unique 위반(예: community_reward)은 기존대로 실패.
 */
export const POINT_LEDGER_REFUND_RELEASE_ONCE_INDEX = "point_ledger_refund_release_once_uidx";

export function isPointLedgerRefundReleaseOnceViolation(
  err: { code?: string | null; message?: string | null; details?: string | null } | null | undefined
): boolean {
  if (!err || String(err.code ?? "") !== "23505") return false;
  const text = `${err.message ?? ""} ${err.details ?? ""}`;
  return text.includes(POINT_LEDGER_REFUND_RELEASE_ONCE_INDEX);
}

export type SpendUserPointsResult = PointLedgerMutationResult;

export type CreditUserPointsInput = {
  userId: string;
  amount: number;
  entryType: PointLedgerEntryType;
  relatedType: PointLedgerRelatedType;
  relatedId: string;
  description: string;
  actorType: PointLedgerActorType;
  earnedAt?: string;
  expiresAt?: string;
};

export type ReconcileUserPointBalanceResult =
  | {
      ok: true;
      repaired: boolean;
      cacheBefore: number;
      ledgerSum: number;
      cacheAfter: number;
    }
  | { ok: false; error: string; code?: "table_missing" };

/**
 * 잔액 캐시(profiles.points) 읽기 — 실패를 0 과 구분한다.
 * 화면 표시 경로(회원·관리자)는 이 결과를 쓴다: 실패 = "확인 불가", 0 으로 대체 금지
 * (dibay-community-dpoint-financial-hard-lock §8 · 관리자 Gate B "error ≠ zero").
 * 음수(시스템 회수 후 미정산)는 그대로 돌려준다(F-13).
 */
export async function readUserPointBalanceResult(
  sb: SupabaseClient,
  userId: string
): Promise<{ ok: true; balance: number } | { ok: false; error: string }> {
  const uid = userId.trim();
  if (!uid) return { ok: true, balance: 0 };
  const { data, error } = await sb.from("profiles").select("points").eq("id", uid).maybeSingle();
  if (error) return { ok: false, error: error.message ?? "points_read_failed" };
  return { ok: true, balance: Math.trunc(Number((data as { points?: number } | null)?.points ?? 0)) };
}

/**
 * Fast-path cache read for ledger writers. Authority for mutations = sumUserPointLedger.
 * 읽기 실패 시 0 — 표시용으로 쓰지 말 것(readUserPointBalanceResult 사용).
 */
export async function readUserPointBalance(
  sb: SupabaseClient,
  userId: string
): Promise<number> {
  const r = await readUserPointBalanceResult(sb, userId);
  return r.ok ? r.balance : 0;
}

/** SSOT: SUM(point_ledger.amount) for user. */
export async function sumUserPointLedger(
  sb: SupabaseClient,
  userId: string
): Promise<{ ok: true; sum: number } | { ok: false; error: string; code?: "table_missing" }> {
  const uid = userId.trim();
  if (!uid) return { ok: true, sum: 0 };

  const rpc = await sb.rpc("sum_user_point_ledger", { p_user_id: uid });
  if (!rpc.error && rpc.data !== null && rpc.data !== undefined) {
    return { ok: true, sum: Math.trunc(Number(rpc.data) || 0) };
  }

  // Fallback when RPC not yet deployed (dev) — page through amounts.
  const { data, error } = await sb.from("point_ledger").select("amount").eq("user_id", uid);
  if (error) {
    if (isMissingPointsTable(error.message ?? "", "point_ledger")) {
      return { ok: false, error: "table_missing", code: "table_missing" };
    }
    // Prefer RPC error if both fail
    if (rpc.error && !isMissingRpc(rpc.error.message ?? "")) {
      return { ok: false, error: rpc.error.message };
    }
    return { ok: false, error: error.message };
  }
  const sum = (data ?? []).reduce((acc, row) => acc + Math.trunc(Number((row as { amount?: number }).amount ?? 0)), 0);
  return { ok: true, sum };
}

function isMissingRpc(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("could not find the function") ||
    (m.includes("function") && m.includes("does not exist"))
  );
}

/**
 * profiles.points 재투영 — DB 함수 project_user_point_balance_from_ledger 만 쓴다.
 * P0 DB-1: RPC 실패 시 TS 가 잠금 없이 합계를 읽어 profiles.points 를 덮어쓰던 폴백 제거 (오래된 값 덮어쓰기 방지).
 */
export async function projectUserPointBalanceFromLedger(
  sb: SupabaseClient,
  userId: string
): Promise<{ ok: true; balance: number } | { ok: false; error: string; code?: "table_missing" }> {
  const uid = userId.trim();
  if (!uid) return { ok: false, error: "invalid_input" };

  const rpc = await sb.rpc("project_user_point_balance_from_ledger", { p_user_id: uid });
  if (!rpc.error && rpc.data !== null && rpc.data !== undefined) {
    return { ok: true, balance: Math.trunc(Number(rpc.data) || 0) };
  }
  return { ok: false, error: rpc.error?.message ?? "projection_failed" };
}

/** Detect cache vs ledger mismatch; repair cache from ledger when needed. */
export async function reconcileUserPointBalance(
  sb: SupabaseClient,
  userId: string
): Promise<ReconcileUserPointBalanceResult> {
  const uid = userId.trim();
  if (!uid) return { ok: false, error: "invalid_input" };

  const cacheBefore = await readUserPointBalance(sb, uid);
  const summed = await sumUserPointLedger(sb, uid);
  if (!summed.ok) return summed;
  const ledgerSum = summed.sum;
  if (cacheBefore === ledgerSum) {
    return { ok: true, repaired: false, cacheBefore, ledgerSum, cacheAfter: cacheBefore };
  }
  const projected = await projectUserPointBalanceFromLedger(sb, uid);
  if (!projected.ok) return projected;
  return {
    ok: true,
    repaired: true,
    cacheBefore,
    ledgerSum,
    cacheAfter: projected.balance,
  };
}

type PointMutationRpcPayload = {
  ok?: boolean;
  error?: string;
  duplicate?: boolean;
  ledger_id?: string | null;
  balance?: number;
  balance_after?: number;
};

function toMutationResult(data: unknown, error: { message?: string } | null): PointLedgerMutationResult {
  if (error) return { ok: false, error: error.message ?? "rpc_failed" };
  const p = (data ?? null) as PointMutationRpcPayload | null;
  if (!p || p.ok !== true) {
    const code = p?.error === "insufficient_balance" ? "insufficient_balance" : undefined;
    return { ok: false, error: typeof p?.error === "string" ? p.error : "rpc_failed", code };
  }
  const balanceAfter = Math.trunc(Number(p.balance_after) || 0);
  const ledgerId = p.ledger_id ? String(p.ledger_id) : undefined;
  return p.duplicate === true
    ? { ok: true, duplicate: true, balanceAfter, ledgerId }
    : { ok: true, balanceAfter, ledgerId };
}

/**
 * 포인트 차감 — P0 DB-1 원자 RPC `spend_user_points` 한 번.
 * 회원 행 잠금 → 같은 출처(related_type+related_id) 중복 확인 → 원장 합계 → 부족 거절 → 원장 INSERT → 재투영.
 * 동시 요청·재시도에도 이중 차감·음수가 생기지 않는다. 허용 entry_type: ad_hold · ad_purchase · ad_charge.
 */
export async function spendUserPoints(
  sb: SupabaseClient,
  input: SpendUserPointsInput
): Promise<SpendUserPointsResult> {
  const uid = input.userId.trim();
  const relatedId = String(input.relatedId ?? "").trim();
  const cost = Math.max(0, Math.floor(Number(input.amount) || 0));
  if (!uid || !relatedId || cost < 1) {
    return { ok: false, error: "invalid_input" };
  }
  const { data, error } = await sb.rpc("spend_user_points", {
    p_user_id: uid,
    p_amount: cost,
    p_entry_type: input.entryType,
    p_related_type: input.relatedType,
    p_related_id: relatedId,
    p_description: input.description.slice(0, 500),
    p_actor_type: input.actorType,
  });
  return toMutationResult(data, error);
}

/**
 * 포인트 환원·환급 지급 — P0 DB-1 원자 RPC `credit_user_points` 한 번.
 * 같은 entry_type+출처가 이미 있으면 duplicate (다시 지급하지 않음). 허용 entry_type: ad_hold_release · ad_refund.
 */
export async function creditUserPoints(
  sb: SupabaseClient,
  input: CreditUserPointsInput
): Promise<PointLedgerMutationResult> {
  const uid = input.userId.trim();
  const relatedId = String(input.relatedId ?? "").trim();
  const amount = Math.max(0, Math.floor(Number(input.amount) || 0));
  if (!uid || !relatedId || amount < 1) {
    return { ok: false, error: "invalid_input" };
  }
  const { data, error } = await sb.rpc("credit_user_points", {
    p_user_id: uid,
    p_amount: amount,
    p_entry_type: input.entryType,
    p_related_type: input.relatedType,
    p_related_id: relatedId,
    p_description: input.description.slice(0, 500),
    p_actor_type: input.actorType,
    p_earned_at: input.earnedAt ?? null,
    p_expires_at: input.expiresAt ?? null,
  });
  return toMutationResult(data, error);
}

export type AdjustUserPointsInput = {
  userId: string;
  delta: number;
  description: string;
  actorUserId: string;
  /** Unique per adjust; auto-generated when omitted (admin may adjust many times). */
  relatedId?: string;
};

/**
 * Admin 수동 지급/차감 — 운영 원자 RPC `admin_adjust_user_points` (회원 행 잠금·멱등 키·잔액 부족 거절).
 * P0 DB-1: 차감·지급 허브(spend/credit RPC)는 관리자 종류를 받지 않으므로 이 경로만 쓴다.
 */
export async function adjustUserPoints(
  sb: SupabaseClient,
  input: AdjustUserPointsInput
): Promise<PointLedgerMutationResult> {
  const uid = input.userId.trim();
  const delta = Math.trunc(Number(input.delta));
  const description = String(input.description ?? "").trim();
  const actorUserId = String(input.actorUserId ?? "").trim();
  if (!uid || !description || !actorUserId || !Number.isFinite(delta) || delta === 0) {
    return { ok: false, error: "invalid_input" };
  }
  const idempotencyKey =
    String(input.relatedId ?? "").trim() ||
    `adjust:${actorUserId}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
  const { data, error } = await sb.rpc("admin_adjust_user_points", {
    p_user_id: uid,
    p_delta: delta,
    p_description: description,
    p_actor_id: actorUserId,
    p_idempotency_key: idempotencyKey,
  });
  return toMutationResult(data, error);
}

export type AppendUserPointLedgerAuditInput = {
  userId: string;
  entryType: PointLedgerEntryType;
  relatedType: PointLedgerRelatedType;
  relatedId: string;
  description: string;
  actorType: PointLedgerActorType;
  /** 0 only — balance unchanged; audit / finalize only (non-zero → invalid_input). */
  amount?: 0;
};

/**
 * 원장 감사 행 추가. cache 직접 쓰기 없음 — 필요 시 project(무변화).
 */
export async function appendUserPointLedgerAudit(
  sb: SupabaseClient,
  input: AppendUserPointLedgerAuditInput
): Promise<PointLedgerMutationResult> {
  const uid = input.userId.trim();
  const relatedId = String(input.relatedId ?? "").trim();
  const amount = Math.trunc(Number(input.amount ?? 0));
  // P0 DB-1: 잔액을 바꾸는 행은 spend/credit RPC 로만 — 감사 행은 0 원장만 허용.
  if (!uid || !relatedId || amount !== 0) {
    return { ok: false, error: "invalid_input" };
  }

  const { data: existing } = await sb
    .from("point_ledger")
    .select("id")
    .eq("user_id", uid)
    .eq("entry_type", input.entryType)
    .eq("related_type", input.relatedType)
    .eq("related_id", relatedId)
    .limit(1);
  if (Array.isArray(existing) && existing.length > 0) {
    const balance = await readUserPointBalance(sb, uid);
    return { ok: true, balanceAfter: balance };
  }

  const summed = await sumUserPointLedger(sb, uid);
  if (!summed.ok) return { ok: false, error: summed.error, code: summed.code };
  const balanceAfter = summed.sum + amount;

  const { data: ledgerRow, error: ledgerErr } = await sb
    .from("point_ledger")
    .insert({
      user_id: uid,
      entry_type: input.entryType,
      amount,
      balance_after: balanceAfter,
      related_type: input.relatedType,
      related_id: relatedId,
      description: input.description.slice(0, 500),
      actor_type: input.actorType,
    })
    .select("id")
    .maybeSingle();

  if (ledgerErr) {
    if (isMissingPointsTable(ledgerErr.message ?? "", "point_ledger")) {
      return { ok: false, error: "table_missing", code: "table_missing" };
    }
    return { ok: false, error: ledgerErr.message };
  }

  const projected = await projectUserPointBalanceFromLedger(sb, uid);
  if (!projected.ok) return { ok: false, error: projected.error, code: projected.code };

  return {
    ok: true,
    balanceAfter: projected.balance,
    ledgerId: ledgerRow ? String((ledgerRow as { id?: string }).id ?? "") : undefined,
  };
}
