/**
 * 거래 글 위치 SSOT (주소 SSOT 2단계 후속 · Owner 2026-11-09 「진행」).
 * 글의 시/군(trade_lgu_id)과 동네 칸(region/city)은 **서버가 글쓴이의 주소 행에서** 정한다 — 화면이 보낸 값은 믿지 않는다.
 * 주소: 거래 글쓰기에서 고른 주소(addressId, 본인 활성 주소일 때) → 없으면 대표 주소.
 * 값: 회원 주소 조회 SSOT(listUserAddresses → withDerivedAddressLocation)의 canonicalLguId / appRegionId·appCityId.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { listUserAddresses } from "@/lib/addresses/user-address-service";

export type TradePostLocation = {
  tradeLguId: string;
  region: string | null;
  city: string | null;
  addressId: string;
};

export async function resolveTradePostLocationForUser(
  sb: SupabaseClient<any>,
  userId: string,
  addressId?: string | null,
): Promise<TradePostLocation | null> {
  const rows = await listUserAddresses(sb, userId);
  const wanted = (addressId ?? "").trim();
  const row = (wanted ? rows.find((r) => r.id === wanted) : null) ?? rows.find((r) => r.isDefaultMaster) ?? null;
  const lgu = (row?.canonicalLguId ?? "").trim();
  if (!row || !lgu) return null;
  return {
    tradeLguId: lgu,
    region: (row.appRegionId ?? "").trim() || null,
    city: (row.appCityId ?? "").trim() || null,
    addressId: row.id,
  };
}
