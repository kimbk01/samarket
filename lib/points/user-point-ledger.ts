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

export async function readUserPointBalance(
  sb: SupabaseClient,
  userId: string
): Promise<number> {
  const uid = userId.trim();
  if (!uid) return 0;
  const { data, error } = await sb.from("profiles").select("points").eq("id", uid).maybeSingle();
  if (error) return 0;
  return Math.max(0, Number((data as { points?: number } | null)?.points ?? 0));
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

/**
 * 포인트 차감 — profiles.points 와 point_ledger 를 함께 갱신한다.
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
    const balance = await readUserPointBalance(sb, uid);
    return { ok: true, balanceAfter: balance };
  }

  const { data: profile, error: profileErr } = await sb
    .from("profiles")
    .select("points")
    .eq("id", uid)
    .maybeSingle();
  if (profileErr) {
    if (isMissingPointsTable(profileErr.message ?? "", "profiles")) {
      return { ok: false, error: "table_missing", code: "table_missing" };
    }
    return { ok: false, error: profileErr.message };
  }
  if (!profile) return { ok: false, error: "user_not_found" };

  const current = Math.max(0, Number((profile as { points?: number }).points ?? 0));
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

  const { error: updateErr } = await sb.from("profiles").update({ points: balanceAfter }).eq("id", uid);
  if (updateErr) {
    return { ok: false, error: updateErr.message };
  }

  return {
    ok: true,
    balanceAfter,
    ledgerId: ledgerRow ? String((ledgerRow as { id?: string }).id ?? "") : undefined,
  };
}

/** 포인트 지급(환불·보상 등) — profiles.points 와 point_ledger 동시 갱신 */
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
    const balance = await readUserPointBalance(sb, uid);
    return { ok: true, balanceAfter: balance };
  }

  const { data: profile, error: profileErr } = await sb
    .from("profiles")
    .select("points")
    .eq("id", uid)
    .maybeSingle();
  if (profileErr) {
    return { ok: false, error: profileErr.message };
  }
  if (!profile) return { ok: false, error: "user_not_found" };

  const current = Math.max(0, Number((profile as { points?: number }).points ?? 0));
  const balanceAfter = current + amount;

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

  const { error: updateErr } = await sb.from("profiles").update({ points: balanceAfter }).eq("id", uid);
  if (updateErr) {
    return { ok: false, error: updateErr.message };
  }

  return {
    ok: true,
    balanceAfter,
    ledgerId: ledgerRow ? String((ledgerRow as { id?: string }).id ?? "") : undefined,
  };
}

/** 만료 실행 — 원장 항목 expired_amount 갱신 + expire 차감 원장 */
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

  const balanceBefore = await readUserPointBalance(sb, uid);
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

  const { error: updateErr } = await sb.from("profiles").update({ points: balanceAfter }).eq("id", uid);
  if (updateErr) return { ok: false, error: updateErr.message };

  return {
    ok: true,
    balanceAfter,
    ledgerId: ledgerRow ? String((ledgerRow as { id?: string }).id ?? "") : undefined,
  };
}
