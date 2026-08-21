/**
 * `/mypage` cold owner-entry authority — tiny stores head for gate only.
 *
 * CONTRACT:
 * - Reuses `getOwnerStoreGateState` (no second state machine)
 * - Does NOT load full me-stores list / sales / order counts
 * - Client must NOT GET me-stores list for this menu row
 * - Purpose: OwnerLite + TTL empty on first `/mypage` paint still shows correct CTA
 */
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import {
  getOwnerStoreGateState,
  type OwnerStoreGateState,
} from "@/lib/stores/store-admin-access";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export type MypageOwnerStoreGateSeed = {
  ownerStoreGate: OwnerStoreGateState;
  ownerStoreGateFirstId: string | null;
};

export async function loadMypageOwnerStoreGateSeedServer(): Promise<MypageOwnerStoreGateSeed | null> {
  const userId = (await getRouteUserId())?.trim() ?? "";
  if (!userId) return null;

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return { ownerStoreGate: getOwnerStoreGateState([]), ownerStoreGateFirstId: null };
  }

  const { data, error } = await sb
    .from("stores")
    .select("id, approval_status, rejected_reason, revision_note")
    .eq("owner_user_id", userId)
    .limit(20);

  if (error) {
    return { ownerStoreGate: getOwnerStoreGateState([]), ownerStoreGateFirstId: null };
  }

  const list = Array.isArray(data) ? data : [];
  const forGate = list.map((s) => ({
    id: String(s.id ?? ""),
    approval_status: String(s.approval_status ?? ""),
    rejected_reason: (s as { rejected_reason?: string | null }).rejected_reason ?? null,
    revision_note: (s as { revision_note?: string | null }).revision_note ?? null,
  }));
  const ownerStoreGate = getOwnerStoreGateState(forGate);
  const approvedId =
    list.find((s) => String(s.approval_status ?? "") === "approved")?.id?.trim() ?? null;
  const ownerStoreGateFirstId =
    ownerStoreGate.kind === "approved"
      ? approvedId || list[0]?.id?.trim() || null
      : list[0]?.id?.trim() || null;

  return { ownerStoreGate, ownerStoreGateFirstId };
}
