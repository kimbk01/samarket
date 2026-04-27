import { NextRequest, NextResponse } from "next/server";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import {
  DEFAULT_AUTH_PHONE_SETTINGS,
  loadAuthPhoneSettings,
  sanitizeAuthPhoneSettingsInput,
} from "@/lib/auth/auth-phone-settings";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const settings = await loadAuthPhoneSettings();
  return NextResponse.json({ ok: true, settings });
}

export async function PATCH(req: NextRequest) {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_service_unconfigured" }, { status: 503 });
  }
  let body: Partial<typeof DEFAULT_AUTH_PHONE_SETTINGS>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const normalized = sanitizeAuthPhoneSettingsInput(body);
  const { error } = await sb.from("auth_phone_settings").upsert(
    {
      ...normalized,
      country_code: "PH",
      provider: normalized.provider,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "country_code,provider" }
  );
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  const settings = await loadAuthPhoneSettings();
  return NextResponse.json({ ok: true, settings });
}
