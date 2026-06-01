import type { SupabaseClient } from "@supabase/supabase-js";

export type ChargeStoreOrderPointsResult =
  | {
      ok: true;
      feeAmount: number;
      balanceAfter: number;
      idempotent: boolean;
    }
  | {
      ok: false;
      error: string;
      required?: number;
      balance?: number;
    };

function isMissingRpc(message: string): boolean {
  return (
    /charge_store_points_on_order_accept/i.test(message) &&
    (/does not exist|Could not find the function/i.test(message))
  );
}

function isMissingTable(message: string): boolean {
  return /store_point/i.test(message) && /does not exist/i.test(message);
}

/**
 * 매장 주문 수락 시 포인트 차감 — Postgres RPC (단일 트랜잭션).
 * 마이그레이션 미적용 env 에서는 ok:true idempotent 스킵(개발 호환).
 */
export async function chargeStorePointsOnOrderAccept(
  sb: SupabaseClient,
  opts: {
    storeId: string;
    orderId: string;
    grossAmountPhp: number;
    actorUserId?: string | null;
  }
): Promise<ChargeStoreOrderPointsResult> {
  const storeId = opts.storeId.trim();
  const orderId = opts.orderId.trim();
  if (!storeId || !orderId) {
    return { ok: false, error: "missing_ids" };
  }

  const gross = Math.max(0, Math.floor(Number(opts.grossAmountPhp) || 0));

  const { data, error } = await sb.rpc("charge_store_points_on_order_accept", {
    p_store_id: storeId,
    p_order_id: orderId,
    p_gross_amount: gross,
    p_actor_user_id: opts.actorUserId?.trim() || null,
  });

  if (error) {
    if (isMissingRpc(error.message) || isMissingTable(error.message)) {
      console.warn("[chargeStorePointsOnOrderAccept] RPC/table missing — skip");
      return { ok: true, feeAmount: 0, balanceAfter: 0, idempotent: true };
    }
    console.error("[chargeStorePointsOnOrderAccept]", error);
    return { ok: false, error: error.message };
  }

  const row = (data ?? {}) as Record<string, unknown>;
  if (row.ok === false) {
    return {
      ok: false,
      error: String(row.error ?? "charge_failed"),
      required: typeof row.required === "number" ? row.required : Number(row.required) || undefined,
      balance: typeof row.balance === "number" ? row.balance : Number(row.balance) || undefined,
    };
  }

  return {
    ok: true,
    feeAmount: Math.max(0, Math.floor(Number(row.fee_amount) || 0)),
    balanceAfter: Math.max(0, Math.floor(Number(row.balance_after) || 0)),
    idempotent: row.idempotent === true,
  };
}
