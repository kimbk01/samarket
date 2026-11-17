/**
 * 진입 감사 PO-3 (2026-11-17) — 새 팝업 형태에 실제 데이터를 채운다(서버 전용).
 * - list_sheet: 어드민이 고른 매장 id 순서대로, 노출 자격(approved · is_visible)이 있는 매장만
 * - coupon_card: 로그인한 회원의 사용 가능(available·restored) 쿠폰 중 7일 안에 만료되는 것 최대 3개
 * 데이터가 없으면 빈 배열 → 그 팝업은 대기열에서 빠진다(빈 팝업 금지).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlatformPopupCouponRow, PlatformPopupListStore } from "@/lib/platform-popup/popup-presentation-types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const PLATFORM_POPUP_LIST_SHEET_MAX_STORES = 20;
export const PLATFORM_POPUP_COUPON_EXPIRING_DAYS = 7;
export const PLATFORM_POPUP_COUPON_CARD_MAX_ROWS = 3;
/** 쿠폰함 — `app/(main)/mypage/coupons` */
export const PLATFORM_POPUP_COUPON_LIST_HREF = "/mypage/coupons";

export async function loadPlatformPopupListStores(
  sb: SupabaseClient,
  ids: readonly string[] | null | undefined
): Promise<PlatformPopupListStore[]> {
  const ordered = [...new Set((ids ?? []).filter((id) => UUID_RE.test(String(id))))].slice(
    0,
    PLATFORM_POPUP_LIST_SHEET_MAX_STORES
  );
  if (!ordered.length) return [];
  const { data, error } = await sb
    .from("stores")
    .select("id, slug, store_name, profile_image_url, cover_image_url, approval_status, is_visible")
    .in("id", ordered);
  if (error || !data) return [];
  const byId = new Map<string, PlatformPopupListStore>();
  for (const row of data as Array<Record<string, unknown>>) {
    if (row.approval_status !== "approved" || row.is_visible !== true) continue;
    const slug = String(row.slug ?? "").trim();
    if (!slug) continue;
    byId.set(String(row.id), {
      id: String(row.id),
      slug,
      name: String(row.store_name ?? "").trim() || slug,
      imageUrl: (row.profile_image_url as string | null) || (row.cover_image_url as string | null) || null,
      href: `/stores/${encodeURIComponent(slug)}`,
    });
  }
  return ordered.map((id) => byId.get(id)).filter((s): s is PlatformPopupListStore => Boolean(s));
}

export async function loadPlatformPopupExpiringCoupons(
  sb: SupabaseClient,
  userId: string | null,
  now: Date = new Date()
): Promise<PlatformPopupCouponRow[]> {
  if (!userId) return [];
  const until = new Date(now.getTime() + PLATFORM_POPUP_COUPON_EXPIRING_DAYS * 24 * 3600_000);
  const { data, error } = await sb
    .from("coupon_user_entitlements")
    .select("id, campaign_id, store_id, expires_at")
    .eq("buyer_user_id", userId)
    .in("status", ["available", "restored"])
    .gt("expires_at", now.toISOString())
    .lte("expires_at", until.toISOString())
    .order("expires_at", { ascending: true })
    .limit(PLATFORM_POPUP_COUPON_CARD_MAX_ROWS);
  if (error || !data?.length) return [];
  const rows = data as Array<{ id: string; campaign_id: string | null; store_id: string | null; expires_at: string | null }>;
  const campaignIds = [...new Set(rows.map((r) => r.campaign_id).filter((v): v is string => Boolean(v)))];
  const storeIds = [...new Set(rows.map((r) => r.store_id).filter((v): v is string => Boolean(v)))];
  const [campaigns, stores] = await Promise.all([
    campaignIds.length
      ? sb.from("store_coupon_campaigns").select("id, title").in("id", campaignIds)
      : Promise.resolve({ data: [], error: null }),
    storeIds.length
      ? sb.from("stores").select("id, store_name").in("id", storeIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (campaigns.error || stores.error) return [];
  const titleById = new Map(
    ((campaigns.data ?? []) as Array<{ id: string; title: string | null }>).map((c) => [c.id, (c.title ?? "").trim()])
  );
  const storeById = new Map(
    ((stores.data ?? []) as Array<{ id: string; store_name: string | null }>).map((s) => [s.id, (s.store_name ?? "").trim()])
  );
  return rows
    .map((r) => ({
      id: r.id,
      title: (r.campaign_id && titleById.get(r.campaign_id)) || "",
      storeName: (r.store_id && storeById.get(r.store_id)) || null,
      expiresAt: r.expires_at,
      href: PLATFORM_POPUP_COUPON_LIST_HREF,
    }))
    .filter((c) => c.title);
}
