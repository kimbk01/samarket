import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppLanguageCode } from "@/lib/i18n/config";
import { resolveServerAppLanguage } from "@/lib/i18n/app-language-authority";

/** API·서버 — 계정 설정(`user_settings.preferred_language`) → Accept-Language → en (`docs/i18n-ssot.md` §2) */
export async function loadUserAppLanguage(
  sb: SupabaseClient | null,
  userId: string,
  acceptLanguage?: string | null
): Promise<AppLanguageCode> {
  const uid = userId.trim();
  let account: unknown = null;
  if (sb && uid) {
    const { data } = await sb
      .from("user_settings")
      .select("preferred_language")
      .eq("user_id", uid)
      .maybeSingle();
    account = (data as { preferred_language?: unknown } | null)?.preferred_language;
  }
  return resolveServerAppLanguage({ account, acceptLanguage });
}
