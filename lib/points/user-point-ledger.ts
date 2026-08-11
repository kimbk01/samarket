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
  | { ok: true; balanceAfter: number; ledgerId?: string }
  | { ok: false; error: string; code?: "insufficient_balance" | "table_missing" | "duplicate" };

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

export type ExpireUserPointEntriesInput = {
  userId: string;
  totalAmount: number;
  executionId: string;
  description: string;
  actorType: PointLedgerActorType;
  ledgerEntryIds: Array<{ id: string; amount: number }>;
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
 * Fast-path cache read. Authority for mutations = sumUserPointLedger.
 */
export async function readUserPointBalance(
  sb: SupabaseClient,
  userId: string
): Promise<number> {
  const uid = userId.trim();
  if (!uid) return 0;
  const { data, error } = await sb.from("profiles").select("points").eq("id", uid).maybeSingle();
  if (error) return 0;
  return Math.trunc(Number((data as { points?: number } | null)?.points ?? 0));
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
 * ONLY allowed TS writer for profiles.points — projects ledger SUM (may be negative after system reversal).
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

  const summed = await sumUserPointLedger(sb, uid);
  if (!summed.ok) return summed;
  const balance = summed.sum;
  const { error } = await sb.from("profiles").update({ points: balance }).eq("id", uid);
  if (error) {
    if (isMissingPointsTable(error.message ?? "", "profiles")) {
      return { ok: false, error: "table_missing", code: "table_missing" };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true, balance };
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

async function hasLedgerRelatedEntry(
  sb: SupabaseClient,
  userId: string,
  relatedType: string,
  relatedId: string
): Promise<boolean> {
  const { data, error } = await sb
    .from("point_ledger")
    .select("id")
    .eq("user_id", userId)
    .eq("related_type", relatedType)
    .eq("related_id", relatedId)
    .limit(1);
  if (error) {
    if (isMissingPointsTable(error.message ?? "", "point_ledger")) return false;
    throw new Error(error.message);
  }
  return Array.isArray(data) && data.length > 0;
}

async function profileExists(sb: SupabaseClient, userId: string): Promise<boolean | { error: string; code?: "table_missing" }> {
  const { data, error } = await sb.from("profiles").select("id").eq("id", userId).maybeSingle();
  if (error) {
    if (isMissingPointsTable(error.message ?? "", "profiles")) {
      return { error: "table_missing", code: "table_missing" };
    }
    return { error: error.message };
  }
  return !!data;
}

/**
 * 포인트 차감 — ledger SSOT INSERT 후 cache project.
 * related_type + related_id 가 이미 원장에 있으면 중복 차감하지 않는다.
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

  if (await hasLedgerRelatedEntry(sb, uid, input.relatedType, relatedId)) {
    const projected = await projectUserPointBalanceFromLedger(sb, uid);
    if (!projected.ok) {
      const balance = await readUserPointBalance(sb, uid);
      return { ok: true, balanceAfter: balance };
    }
    return { ok: true, balanceAfter: projected.balance };
  }

  const exists = await profileExists(sb, uid);
  if (typeof exists === "object") {
    return { ok: false, error: exists.error, code: exists.code };
  }
  if (!exists) return { ok: false, error: "user_not_found" };

  const summed = await sumUserPointLedger(sb, uid);
  if (!summed.ok) return { ok: false, error: summed.error, code: summed.code };
  const current = summed.sum;
  if (current < cost) {
    return { ok: false, error: "insufficient_balance", code: "insufficient_balance" };
  }

  const balanceAfter = current - cost;
  const { data: ledgerRow, error: ledgerErr } = await sb
    .from("point_ledger")
    .insert({
      user_id: uid,
      entry_type: input.entryType,
      amount: -cost,
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

/** 포인트 지급 — ledger SSOT INSERT 후 cache project */
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

  const { data: existingCredit } = await sb
    .from("point_ledger")
    .select("id")
    .eq("user_id", uid)
    .eq("entry_type", input.entryType)
    .eq("related_type", input.relatedType)
    .eq("related_id", relatedId)
    .limit(1);
  if (Array.isArray(existingCredit) && existingCredit.length > 0) {
    const projected = await projectUserPointBalanceFromLedger(sb, uid);
    if (!projected.ok) {
      const balance = await readUserPointBalance(sb, uid);
      return { ok: true, balanceAfter: balance };
    }
    return { ok: true, balanceAfter: projected.balance };
  }

  const exists = await profileExists(sb, uid);
  if (typeof exists === "object") {
    return { ok: false, error: exists.error, code: exists.code };
  }
  if (!exists) return { ok: false, error: "user_not_found" };

  const summed = await sumUserPointLedger(sb, uid);
  if (!summed.ok) return { ok: false, error: summed.error, code: summed.code };
  const balanceAfter = summed.sum + amount;

  const ledgerInsert: Record<string, unknown> = {
    user_id: uid,
    entry_type: input.entryType,
    amount,
    balance_after: balanceAfter,
    related_type: input.relatedType,
    related_id: relatedId,
    description: input.description.slice(0, 500),
    actor_type: input.actorType,
  };
  if (input.earnedAt) ledgerInsert.earned_at = input.earnedAt;
  if (input.expiresAt) ledgerInsert.expires_at = input.expiresAt;

  const { data: ledgerRow, error: ledgerErr } = await sb
    .from("point_ledger")
    .insert(ledgerInsert)
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

/** 만료 실행 — 원장 항목 expired_amount 갱신 + expire 차감 원장 + project */
export async function expireUserPointEntries(
  sb: SupabaseClient,
  input: ExpireUserPointEntriesInput
): Promise<PointLedgerMutationResult> {
  const uid = input.userId.trim();
  const deduct = Math.max(0, Math.floor(Number(input.totalAmount) || 0));
  const executionId = String(input.executionId ?? "").trim();
  if (!uid || deduct < 1 || !executionId) {
    return { ok: false, error: "invalid_input" };
  }

  const summed = await sumUserPointLedger(sb, uid);
  if (!summed.ok) return { ok: false, error: summed.error, code: summed.code };
  const balanceBefore = Math.max(0, summed.sum);
  const actualDeduct = Math.min(deduct, balanceBefore);
  if (actualDeduct < 1) {
    return { ok: false, error: "insufficient_balance", code: "insufficient_balance" };
  }

  const balanceAfter = balanceBefore - actualDeduct;
  const { data: ledgerRow, error: ledgerErr } = await sb
    .from("point_ledger")
    .insert({
      user_id: uid,
      entry_type: "expire",
      amount: -actualDeduct,
      balance_after: balanceAfter,
      related_type: "admin_manual",
      related_id: executionId,
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

  for (const entry of input.ledgerEntryIds) {
    const { error: markErr } = await sb
      .from("point_ledger")
      .update({ expired_amount: entry.amount })
      .eq("id", entry.id)
      .eq("user_id", uid)
      .is("expired_amount", null);
    if (markErr) return { ok: false, error: markErr.message };
  }

  const projected = await projectUserPointBalanceFromLedger(sb, uid);
  if (!projected.ok) return { ok: false, error: projected.error, code: projected.code };

  return {
    ok: true,
    balanceAfter: projected.balance,
    ledgerId: ledgerRow ? String((ledgerRow as { id?: string }).id ?? "") : undefined,
  };
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
 * Admin 수동 지급/차감 — credit/spend 허브만 사용 (ledger-only + project).
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
  const relatedId =
    String(input.relatedId ?? "").trim() ||
    `adjust:${actorUserId}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;

  if (delta > 0) {
    return creditUserPoints(sb, {
      userId: uid,
      amount: delta,
      entryType: "admin_credit",
      relatedType: "admin_manual",
      relatedId,
      description,
      actorType: "admin",
    });
  }

  return spendUserPoints(sb, {
    userId: uid,
    amount: Math.abs(delta),
    entryType: "admin_debit",
    relatedType: "admin_manual",
    relatedId,
    description,
    actorType: "admin",
  });
}

export type AppendUserPointLedgerAuditInput = {
  userId: string;
  entryType: PointLedgerEntryType;
  relatedType: PointLedgerRelatedType;
  relatedId: string;
  description: string;
  actorType: PointLedgerActorType;
  /** Defaults to 0 — balance unchanged; audit / finalize only. */
  amount?: number;
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
  if (!uid || !relatedId || !Number.isFinite(amount)) {
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
