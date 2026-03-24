import type { SupabaseClient } from "@supabase/supabase-js";

/** admin_settings — 매장 주문 채팅(일치 확인 등) 알림음 URL */
export const ORDER_MATCH_CHAT_ALERT_SOUND_KEY = "order_match_chat_alert_sound";

/** `value_json.value`(커머스 API) 또는 `value_json.url`(업로드·배달과 동일 스키마) */
export function parseOrderMatchAlertSoundUrl(valueJson: unknown): string | null {
  if (valueJson == null || typeof valueJson !== "object") return null;
  const o = valueJson as Record<string, unknown>;
  for (const k of ["value", "url"] as const) {
    const s = o[k];
    if (typeof s !== "string") continue;
    const t = s.trim();
    if (t.length > 0) return t;
  }
  return null;
}

export async function getOrderMatchAlertSoundUrl(sb: SupabaseClient): Promise<string | null> {
  const { data, error } = await sb
    .from("admin_settings")
    .select("value_json")
    .eq("key", ORDER_MATCH_CHAT_ALERT_SOUND_KEY)
    .maybeSingle();
  if (error || !data) return null;
  return parseOrderMatchAlertSoundUrl(data.value_json);
}
