import type { SupabaseClient } from "@supabase/supabase-js";
import { getPublicDeployTier } from "@/lib/config/deploy-surface";

/**
 * 인앱 알림 쿨다운 — 로컬은 0(연속 QA), 그 외는 admin 또는 기본 1초(구 3초보다 빠른 실서비스 체감).
 */
export async function getAdminNotificationCooldownSeconds(
  sb: SupabaseClient<any>,
  type: "trade_chat" | "community_chat"
): Promise<number> {
  const tier = getPublicDeployTier();
  if (tier === "local") return 0;
  try {
    const { data } = await sb
      .from("admin_notification_settings")
      .select("cooldown_seconds")
      .eq("type", type)
      .maybeSingle();
    const n = Number((data as { cooldown_seconds?: number } | null)?.cooldown_seconds);
    if (Number.isFinite(n) && n >= 0) return Math.min(600, n);
  } catch {
    /* ignore */
  }
  return 1;
}
