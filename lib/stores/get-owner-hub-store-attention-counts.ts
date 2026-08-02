import type { SupabaseClient } from "@supabase/supabase-js";
import {
  readHubStoreAttentionMemory,
  writeHubStoreAttentionMemory,
} from "@/lib/stores/hub-store-attention-memory-cache";

export { invalidateHubStoreAttentionMemory } from "@/lib/stores/hub-store-attention-memory-cache";

export const OWNER_HUB_STORE_ATTENTION_COUNTS_RPC = "get_owner_hub_store_attention_counts";

export type OwnerHubStoreAttentionCounts = {
  refundPendingCount: number;
  orderPendingCount: number;
  /** Slice 2-5 C_store — cancel_requested Action Required */
  cancelPendingCount: number;
  inquiryPendingCount: number;
};

/** RPC 우선 — legacy 3× count 와 동일 조건. Hub badge: process memory TTL(5s) read-through. */
export async function getOwnerHubStoreAttentionCounts(
  storesSb: SupabaseClient<any>,
  storeId: string
): Promise<OwnerHubStoreAttentionCounts | null> {
  const sid = storeId.trim();
  if (!sid) return null;

  const mem = readHubStoreAttentionMemory(sid);
  if (mem.hit) {
    return mem.counts;
  }

  const { data, error } = await storesSb.rpc(OWNER_HUB_STORE_ATTENTION_COUNTS_RPC, {
    p_store_id: sid,
  });
  if (error) {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console -- dev RPC deploy probe
      console.warn("[store-attention-rpc-miss]", error.message);
    }
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const counts: OwnerHubStoreAttentionCounts = {
    refundPendingCount: Math.max(0, Math.floor(Number(d.refund_pending_count) || 0)),
    orderPendingCount: Math.max(0, Math.floor(Number(d.order_pending_count) || 0)),
    cancelPendingCount: Math.max(0, Math.floor(Number(d.cancel_pending_count) || 0)),
    inquiryPendingCount: Math.max(0, Math.floor(Number(d.inquiry_pending_count) || 0)),
  };
  writeHubStoreAttentionMemory(sid, counts);
  return counts;
}
