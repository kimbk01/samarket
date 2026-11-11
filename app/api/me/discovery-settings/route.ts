import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 친구 찾기 설정 (설계안 v3 §3.7) — `member_discovery_settings` (service_role 전용 표).
 * 행이 없으면 둘 다 켜짐(표 기본값과 같음).
 */
type DiscoverySettings = { allowIdSearch: boolean; allowQrAdd: boolean };

const DEFAULTS: DiscoverySettings = { allowIdSearch: true, allowQrAdd: true };

function toSettings(row: { allow_id_search?: unknown; allow_qr_add?: unknown } | null): DiscoverySettings {
  if (!row) return DEFAULTS;
  return {
    allowIdSearch: row.allow_id_search !== false,
    allowQrAdd: row.allow_qr_add !== false,
  };
}

export async function GET() {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_service_role_required" }, { status: 503 });
  }
  const { data, error } = await sb
    .from("member_discovery_settings")
    .select("allow_id_search, allow_qr_add")
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ ok: false, error: "discovery_settings_load_failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, settings: toSettings(data) });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `member-discovery-settings:${getRateLimitKey(req, auth.userId)}`,
    limit: 30,
    windowMs: 60_000,
    code: "member_discovery_settings_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_service_role_required" }, { status: 503 });
  }

  let body: { allowIdSearch?: unknown; allowQrAdd?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const patch: Record<string, boolean | string> = {};
  if (typeof body.allowIdSearch === "boolean") patch.allow_id_search = body.allowIdSearch;
  if (typeof body.allowQrAdd === "boolean") patch.allow_qr_add = body.allowQrAdd;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: false, error: "nothing_to_update" }, { status: 400 });
  }
  patch.updated_at = new Date().toISOString();

  const { data, error } = await sb
    .from("member_discovery_settings")
    .upsert({ user_id: auth.userId, ...patch }, { onConflict: "user_id" })
    .select("allow_id_search, allow_qr_add")
    .single();
  if (error) {
    return NextResponse.json({ ok: false, error: "discovery_settings_save_failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, settings: toSettings(data) });
}
