import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";
import {
  loadAuthPhoneSettings,
  sanitizeAuthPhoneSettingsInput,
} from "@/lib/auth/auth-phone-settings";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { adminServerText } from "@/lib/i18n/admin-server-language";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 설정을 **읽지 못함**(조회 오류) — 기본값을 「현재 설정」처럼 돌려주면 관리자 화면이 기본값을 저장해 운영값을 덮는다.
 * 읽지 못하면 503 으로 답하고 저장하지 않는다 (등록 후속 감사 7번).
 */
function phoneSettingsUnavailable() {
  return NextResponse.json({ ok: false, error: "phone_settings_unavailable" }, { status: 503 });
}

export async function GET() {
  const gate = await requireAdminPermission("settings");
  if (!gate.ok) return gate.response;
  const settings = await loadAuthPhoneSettings();
  if (settings.load_failed) return phoneSettingsUnavailable();
  return NextResponse.json({ ok: true, settings });
}

/**
 * Parameter edits only (TTL/resend/attempts/guide).
 * ON/OFF must go through `/api/admin/users/phone-verification/ops`.
 */
export async function PATCH(req: NextRequest) {
  const gate = await requireAdminPermission("settings");
  if (!gate.ok) return gate.response;
  const sb = gate.sb ?? tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_service_unconfigured" }, { status: 503 });
  }
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (Object.prototype.hasOwnProperty.call(body, "enabled")) {
    return NextResponse.json(
      {
        ok: false,
        error: "enabled_via_phone_ops",
        message: await adminServerText("admin_api_auth_phone_toggle_elsewhere"),
      },
      { status: 400 },
    );
  }
  const current = await loadAuthPhoneSettings();
  if (current.load_failed) return phoneSettingsUnavailable();
  const normalized = sanitizeAuthPhoneSettingsInput({
    ...body,
    enabled: current.enabled,
    provider: "semaphore",
  });
  /**
   * `enabled` 는 쓰지 않는다 — ON/OFF 는 `/api/admin/users/phone-verification/ops`(RPC `admin_set_auth_phone_otp_enabled`)만.
   * 행이 있으면 upsert 가 넘긴 열만 갱신하고, 첫 행 생성이면 DB 기본값(enabled=false)이 들어간다.
   */
  const { error } = await sb.from("auth_phone_settings").upsert(
    {
      country_code: "PH",
      provider: "semaphore_local",
      sms_from_name: normalized.sms_from_name,
      otp_ttl_seconds: normalized.otp_ttl_seconds,
      resend_cooldown_seconds: normalized.resend_cooldown_seconds,
      max_attempts: normalized.max_attempts,
      guide_text: normalized.guide_text,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "country_code,provider" },
  );
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  await appendAdminRouteAudit(sb, req, {
    actorId: gate.actor.userId,
    targetType: "auth_phone_settings",
    targetId: "PH:semaphore_local",
    action: "auth_phone_settings.update",
    before: {
      otp_ttl_seconds: current.otp_ttl_seconds,
      resend_cooldown_seconds: current.resend_cooldown_seconds,
      max_attempts: current.max_attempts,
      sms_from_name: current.sms_from_name,
    },
    after: {
      otp_ttl_seconds: normalized.otp_ttl_seconds,
      resend_cooldown_seconds: normalized.resend_cooldown_seconds,
      max_attempts: normalized.max_attempts,
      sms_from_name: normalized.sms_from_name,
    },
  });
  const settings = await loadAuthPhoneSettings();
  return NextResponse.json({ ok: true, settings });
}
