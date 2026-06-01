import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeStorePointFeeAmount,
  DEFAULT_STORE_POINT_POLICY,
} from "@/lib/stores/compute-store-point-fee";
import { loadEffectiveStorePointPolicy, effectivePolicyToFeeLike } from "@/lib/stores/load-effective-store-point-policy";

export type StorePointSummary = {
  pointBalance: number;
  pointCommerceBlocked: boolean;
  pointBlockReason: string | null;
  estimatedFeePerOrder: number;
  estimatedAcceptCount: number;
};

function isMissingColumn(message: string): boolean {
  return /point_balance|point_commerce_blocked/i.test(message) && /does not exist/i.test(message);
}

export async function loadStorePointSummary(
  sb: SupabaseClient,
  opts: { storeId: string; storeCategoryId?: string | null; sampleGrossPhp?: number }
): Promise<StorePointSummary | null> {
  const sid = opts.storeId.trim();
  if (!sid) return null;

  const { data, error } = await sb
    .from("stores")
    .select("point_balance, point_commerce_blocked, point_block_reason")
    .eq("id", sid)
    .maybeSingle();

  if (error) {
    if (isMissingColumn(error.message)) return null;
    console.error("[loadStorePointSummary]", error);
    return null;
  }
  if (!data) return null;

  const balance = Math.max(0, Math.floor(Number(data.point_balance) || 0));
  let fee = computeStorePointFeeAmount(DEFAULT_STORE_POINT_POLICY, opts.sampleGrossPhp ?? 0);
  try {
    const policy = await loadEffectiveStorePointPolicy(sb, {
      storeId: sid,
      storeCategoryId: opts.storeCategoryId ?? null,
    });
    fee = computeStorePointFeeAmount(effectivePolicyToFeeLike(policy), opts.sampleGrossPhp ?? 0);
  } catch {
    /* fallback fee */
  }
  const perOrder = Math.max(1, fee);
  const acceptCount = Math.floor(balance / perOrder);

  return {
    pointBalance: balance,
    pointCommerceBlocked: data.point_commerce_blocked === true,
    pointBlockReason: (data.point_block_reason as string | null) ?? null,
    estimatedFeePerOrder: perOrder,
    estimatedAcceptCount: acceptCount,
  };
}
