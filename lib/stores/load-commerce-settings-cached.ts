import type { SupabaseClient } from "@supabase/supabase-js";
import {
  loadCommerceSettings,
  type CommerceSettingsResolved,
} from "@/lib/stores/load-commerce-settings";

const TTL_MS = 60_000;
let cached: { expiresAt: number; value: CommerceSettingsResolved } | null = null;
let inflight: Promise<CommerceSettingsResolved> | null = null;

/** admin_settings — 전역 설정, 짧은 TTL 메모리 캐시 */
export async function loadCommerceSettingsCached(
  sb: SupabaseClient
): Promise<CommerceSettingsResolved> {
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (inflight) return inflight;
  inflight = loadCommerceSettings(sb)
    .then((value) => {
      cached = { expiresAt: Date.now() + TTL_MS, value };
      return value;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function resetCommerceSettingsCacheForTests(): void {
  cached = null;
  inflight = null;
}
