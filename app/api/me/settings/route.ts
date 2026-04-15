import { NextRequest } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";
import { DEFAULT_USER_SETTINGS, type UserSettingsRow } from "@/lib/types/settings-db";
import { USER_SETTINGS_ROW_SELECT } from "@/lib/me/user-settings-select";
import { normalizeAppLanguage } from "@/lib/i18n/config";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { jsonErrorWithRequest, jsonOkWithRequest } from "@/lib/http/api-route";

export const dynamic = "force-dynamic";

function isUserSettingsTableMissing(message: string): boolean {
  const lowered = message.toLowerCase();
  return lowered.includes("user_settings") && lowered.includes("does not exist");
}

function normalizePatch(body: Record<string, unknown>): Partial<UserSettingsRow> {
  const patch: Partial<UserSettingsRow> = {};
  if ("push_enabled" in body) patch.push_enabled = body.push_enabled !== false;
  if ("chat_push_enabled" in body) patch.chat_push_enabled = body.chat_push_enabled !== false;
  if ("marketing_push_enabled" in body) patch.marketing_push_enabled = body.marketing_push_enabled === true;
  if ("do_not_disturb_enabled" in body) {
    patch.do_not_disturb_enabled = body.do_not_disturb_enabled === true;
  }
  if ("do_not_disturb_start" in body) {
    patch.do_not_disturb_start = body.do_not_disturb_start ? String(body.do_not_disturb_start) : null;
  }
  if ("do_not_disturb_end" in body) {
    patch.do_not_disturb_end = body.do_not_disturb_end ? String(body.do_not_disturb_end) : null;
  }
  if ("video_autoplay_mode" in body) {
    const value = String(body.video_autoplay_mode ?? "wifi_only");
    patch.video_autoplay_mode =
      value === "always" || value === "never" ? value : "wifi_only";
  }
  if ("preferred_language" in body) {
    patch.preferred_language = normalizeAppLanguage(body.preferred_language);
  }
  if ("preferred_country" in body) {
    patch.preferred_country = String(body.preferred_country ?? "PH").trim() || "PH";
  }
  if ("personalization_enabled" in body) {
    patch.personalization_enabled = body.personalization_enabled !== false;
  }
  if ("chat_preview_enabled" in body) {
    patch.chat_preview_enabled = body.chat_preview_enabled !== false;
  }
  if ("app_banner_hidden" in body) {
    patch.app_banner_hidden = body.app_banner_hidden === true;
  }
  return patch;
}

async function readProfileFallback(userId: string) {
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return null;
  const { data } = await sb
    .from("profiles")
    .select("preferred_language, preferred_country")
    .eq("id", userId)
    .maybeSingle();
  return data ?? null;
}

export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const sb = tryCreateSupabaseServiceClient();
  const profileFallback = await readProfileFallback(auth.userId);
  const baseSettings = {
    ...DEFAULT_USER_SETTINGS,
    ...(profileFallback?.preferred_language
      ? { preferred_language: normalizeAppLanguage(profileFallback.preferred_language) }
      : {}),
    ...(profileFallback?.preferred_country
      ? { preferred_country: String(profileFallback.preferred_country) }
      : {}),
    user_id: auth.userId,
  };

  if (!sb) {
    return jsonOkWithRequest(req, { settings: baseSettings, source: "profile_fallback" });
  }

  const { data, error } = await sb
    .from("user_settings")
    .select(USER_SETTINGS_ROW_SELECT)
    .eq("user_id", auth.userId)
    .maybeSingle();

  if (error) {
    if (isUserSettingsTableMissing(error.message ?? "")) {
      return jsonOkWithRequest(req, { settings: baseSettings, source: "profile_fallback" });
    }
    return jsonErrorWithRequest(req, error.message ?? "settings_fetch_failed", 500);
  }

  return jsonOkWithRequest(req, {
    settings: {
      ...baseSettings,
      ...(data ?? {}),
    },
    source: data ? "user_settings" : "defaults",
  });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonErrorWithRequest(req, "invalid_json", 400);
  }
  if (!raw || typeof raw !== "object") {
    return jsonErrorWithRequest(req, "invalid_payload", 400);
  }

  const patch = normalizePatch(raw as Record<string, unknown>);
  const sb = tryCreateSupabaseServiceClient();
  const profileFallback = await readProfileFallback(auth.userId);
  const baseSettings = {
    ...DEFAULT_USER_SETTINGS,
    ...(profileFallback?.preferred_language
      ? { preferred_language: normalizeAppLanguage(profileFallback.preferred_language) }
      : {}),
    ...(profileFallback?.preferred_country
      ? { preferred_country: String(profileFallback.preferred_country) }
      : {}),
    user_id: auth.userId,
  };

  if (!sb) {
    return jsonOkWithRequest(req, { settings: { ...baseSettings, ...patch }, source: "profile_fallback" });
  }

  const { data: before } = await sb
    .from("user_settings")
    .select(USER_SETTINGS_ROW_SELECT)
    .eq("user_id", auth.userId)
    .maybeSingle();

  const nextRow = {
    ...(before ?? baseSettings),
    ...patch,
    user_id: auth.userId,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await sb
    .from("user_settings")
    .upsert(nextRow, { onConflict: "user_id" })
    .select(USER_SETTINGS_ROW_SELECT)
    .maybeSingle();

  if (error) {
    if (isUserSettingsTableMissing(error.message ?? "")) {
      return jsonOkWithRequest(req, { settings: { ...baseSettings, ...patch }, source: "profile_fallback" });
    }
    return jsonErrorWithRequest(req, error.message ?? "settings_update_failed", 500);
  }

  const { ip, userAgent } = getAuditRequestMeta(req);
  await appendAuditLog(sb, {
    actor_type: "user",
    actor_id: auth.userId,
    target_type: "user_settings",
    target_id: auth.userId,
    action: "my.settings.update",
    before_json: before ?? null,
    after_json: data ?? nextRow,
    ip,
    user_agent: userAgent,
  });

  return jsonOkWithRequest(req, { settings: { ...baseSettings, ...(data ?? nextRow) }, source: "user_settings" });
}
