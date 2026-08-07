import type { SupabaseClient } from "@supabase/supabase-js";
import { adminCompleteRefundStoreOrder } from "@/lib/stores/apply-admin-store-order-operations";

export type ApplyAdminRefundOk = {
  ok: true;
  already?: boolean;
};

export type ApplyAdminRefundErr = {
  ok: false;
  error: string;
  httpStatus: number;
};

export type ApplyAdminRefundResult = ApplyAdminRefundOk | ApplyAdminRefundErr;

/**
 * Phase A Recovery — single refund head.
 * Alias of adminCompleteRefundStoreOrder (apply ADMIN → refunded + Recovery Chain).
 */
export async function applyAdminStoreOrderRefund(
  sb: SupabaseClient,
  orderId: string,
  opts?: { adminUserId?: string | null; ip?: string | null; user_agent?: string | null }
): Promise<ApplyAdminRefundResult> {
  return adminCompleteRefundStoreOrder(sb, orderId, {
    adminUserId: String(opts?.adminUserId ?? "").trim() || "admin",
    ip: opts?.ip ?? null,
    user_agent: opts?.user_agent ?? null,
  });
}
