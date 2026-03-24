import type { SupabaseClient } from "@supabase/supabase-js";

/** admin_settings — 매장(배달) 신규 주문 등 브라우저 알림음 소스 URL */
export const STORE_DELIVERY_ALERT_SOUND_KEY = "store_delivery_alert_sound";

const MAX_URL_LEN = 4096;

export function parseStoreDeliverySoundUrl(valueJson: unknown): string | null {
  if (valueJson == null || typeof valueJson !== "object") return null;
  const u = (valueJson as Record<string, unknown>).url;
  if (typeof u !== "string") return null;
  const t = u.trim();
  return t || null;
}

/** 관리자 입력·API 검증 — https URL 또는 사이트 루트 상대 경로 */
export function isValidStoreDeliverySoundUrlInput(raw: string): boolean {
  const s = raw.trim();
  if (!s || s.length > MAX_URL_LEN) return false;
  if (/[\s'"<>]/.test(s)) return false;
  if (s.startsWith("/")) {
    if (s.includes("..") || s.length < 2) return false;
    return true;
  }
  if (/^https?:\/\/.+/i.test(s)) return true;
  return false;
}

export async function fetchStoreDeliveryAlertSoundUrl(sb: SupabaseClient): Promise<string | null> {
  const { data, error } = await sb
    .from("admin_settings")
    .select("value_json")
    .eq("key", STORE_DELIVERY_ALERT_SOUND_KEY)
    .maybeSingle();

  if (error) {
    if (error.message?.includes("admin_settings") && error.message.includes("does not exist")) {
      return null;
    }
    console.warn("[fetchStoreDeliveryAlertSoundUrl]", error.message);
    return null;
  }
  return parseStoreDeliverySoundUrl(data?.value_json);
}

/** 매장 전용 URL 우선, 없으면 admin_settings 전역 URL */
export async function fetchStoreOrderAlertSoundUrlForStore(
  sb: SupabaseClient,
  storeId: string | null | undefined
): Promise<string | null> {
  const sid = typeof storeId === "string" ? storeId.trim() : "";
  if (sid) {
    const { data, error } = await sb
      .from("stores")
      .select("order_alert_sound_url")
      .eq("id", sid)
      .maybeSingle();
    if (!error && data) {
      const u = (data as { order_alert_sound_url?: string | null }).order_alert_sound_url;
      if (typeof u === "string" && u.trim()) return u.trim();
    }
  }
  return fetchStoreDeliveryAlertSoundUrl(sb);
}
