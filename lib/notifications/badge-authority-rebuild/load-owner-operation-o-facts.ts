/**
 * O (Operation) facts — FAB / delivery Bottom (store-scoped).
 * Product Bell digit = A_member only (O not added to Bell).
 * App Icon ∪ O undecided — HTTP currently excludes O from Icon total.
 *
 * Loads C_store attention counts for all stores owned by the member.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getOwnerHubStoreAttentionCounts, invalidateHubStoreAttentionMemory } from "@/lib/stores/get-owner-hub-store-attention-counts";
import { resolveOwnerOperationAttentionCountForStore } from "@/lib/notifications/badge-authority-rebuild/store-operation-c-projection";

export type OwnerOperationOFacts = Readonly<{
  /** |O| = Σ C_store over managed stores (same Task ∪1 per action inside RPC counts). */
  ownerOperationCount: number;
  /** Same |O| for FAB diagnostics (not product Bell digit). */
  ownerOperationBellCount: number;
  storeIds: readonly string[];
}>;

function nonNeg(n: unknown): number {
  return Math.max(0, Math.floor(Number(n) || 0));
}

/** All stores where this user is owner (approved/visible not required for badge truth of open ops). */
export async function listOwnedStoreIdsForBadge(
  sb: SupabaseClient,
  ownerUserId: string
): Promise<string[]> {
  const uid = ownerUserId.trim();
  if (!uid) return [];
  const { data, error } = await sb
    .from("stores")
    .select("id")
    .eq("owner_user_id", uid)
    .limit(50);
  if (error || !data?.length) return [];
  return data.map((r) => String((r as { id: string }).id).trim()).filter(Boolean);
}

export async function loadOwnerOperationOFacts(
  sb: SupabaseClient,
  ownerUserId: string
): Promise<OwnerOperationOFacts> {
  const storeIds = await listOwnedStoreIdsForBadge(sb, ownerUserId);
  if (!storeIds.length) {
    return { ownerOperationCount: 0, ownerOperationBellCount: 0, storeIds: [] };
  }

  let total = 0;
  await Promise.all(
    storeIds.map(async (storeId) => {
      invalidateHubStoreAttentionMemory(storeId);
      const counts = await getOwnerHubStoreAttentionCounts(sb, storeId);
      if (!counts) return;
      total += resolveOwnerOperationAttentionCountForStore(storeId, {
        pendingOrderActions: nonNeg(counts.orderPendingCount),
        refundActions: nonNeg(counts.refundPendingCount),
        cancelActions: nonNeg(counts.cancelPendingCount),
        openInquiryActions: nonNeg(counts.inquiryPendingCount),
      });
    })
  );

  const o = nonNeg(total);
  return {
    ownerOperationCount: o,
    ownerOperationBellCount: o,
    storeIds,
  };
}
