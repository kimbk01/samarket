import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import {
  loadAuthPhoneSettings,
  sanitizeAuthPhoneSettingsInput,
} from "@/lib/auth/auth-phone-settings";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireAdminPermission("settings");
  if (!gate.ok) return gate.response;
  const settings = await loadAuthPhoneSettings();
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
        message: "전화 인증 ON/OFF는 전화번호 인증 관리 화면에서만 변경할 수 있습니다.",
      },
      { status: 400 },
    );
  }
  const current = await loadAuthPhoneSettings();
  const normalized = sanitizeAuthPhoneSettingsInput({
    ...body,
    enabled: current.enabled,
    provider: "semaphore",
  });
  const { error } = await sb.from("auth_phone_settings").upsert(
    {
      enabled: current.enabled,
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
  const settings = await loadAuthPhoneSettings();
  return NextResponse.json({ ok: true, settings });
}
