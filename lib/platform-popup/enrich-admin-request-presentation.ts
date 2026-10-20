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

  // stores 의 이름 열은 store_name 뿐 (운영 스키마에 name 없음 — 예전엔 없는 열을 함께 조회해 오류가 나고,
  // 오류를 확인하지 않아 매장 이름이 항상 비었다). 조회 오류는 덮지 않고 호출자(500)로 올린다.
  if (storeIds.length) {
    const { data, error } = await sb.from("stores").select("id, store_name").in("id", storeIds);
    if (error) throw new Error(`popup_request_stores:${error.message}`);
    for (const row of data ?? []) {
      const id = String((row as { id?: string }).id ?? "");
      const name = String((row as { store_name?: string }).store_name ?? "").trim();
      if (id) storeNameById.set(id, name || id);
    }
  }

  if (ownerIds.length) {
    const { data, error } = await sb
      .from("profiles")
      .select("id, username, nickname")
      .in("id", ownerIds);
    if (error) throw new Error(`popup_request_owners:${error.message}`);
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
