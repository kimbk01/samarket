/**
 * Enrich Owner requests for Admin presentation (store name / owner label).
 * Keeps row SSOT intact; presentation is additive.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlatformPopupOwnerRequestRow } from "@/lib/platform-popup/owner-request-types";

export type PlatformPopupOwnerRequestAdminPresentation = PlatformPopupOwnerRequestRow & {
  storeName: string | null;
  ownerLabel: string | null;
  ownerUsername: string | null;
};

export async function enrichPlatformPopupOwnerRequestsForAdmin(
  sb: SupabaseClient,
  items: PlatformPopupOwnerRequestRow[]
): Promise<PlatformPopupOwnerRequestAdminPresentation[]> {
  if (!items.length) return [];

  const storeIds = [...new Set(items.map((i) => i.storeId).filter(Boolean))];
  const ownerIds = [...new Set(items.map((i) => i.ownerUserId).filter(Boolean))];

  const storeNameById = new Map<string, string>();
  const ownerById = new Map<string, { label: string | null; username: string | null }>();

  if (storeIds.length) {
    const { data } = await sb.from("stores").select("id, store_name, name").in("id", storeIds);
    for (const row of data ?? []) {
      const id = String((row as { id?: string }).id ?? "");
      const name =
        String((row as { store_name?: string }).store_name ?? "").trim() ||
        String((row as { name?: string }).name ?? "").trim();
      if (id) storeNameById.set(id, name || id);
    }
  }

  if (ownerIds.length) {
    const { data } = await sb
      .from("profiles")
      .select("id, username, nickname")
      .in("id", ownerIds);
    for (const row of data ?? []) {
      const id = String((row as { id?: string }).id ?? "");
      const username = String((row as { username?: string }).username ?? "").trim() || null;
      const label =
        String((row as { nickname?: string }).nickname ?? "").trim() || username;
      if (id) ownerById.set(id, { label, username });
    }
  }

  return items.map((item) => {
    const owner = ownerById.get(item.ownerUserId);
    return {
      ...item,
      storeName: storeNameById.get(item.storeId) ?? null,
      ownerLabel: owner?.label ?? null,
      ownerUsername: owner?.username ?? null,
    };
  });
}
