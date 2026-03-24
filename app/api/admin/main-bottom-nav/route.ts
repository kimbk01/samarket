import { NextRequest, NextResponse } from "next/server";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { MAIN_BOTTOM_NAV_SETTINGS_KEY } from "@/lib/main-menu/main-bottom-nav-key";
import {
  getDefaultMainBottomNavAdminRows,
  resolveMainBottomNavAdminRows,
  resolveMainBottomNavDisplayItems,
  validateMainBottomNavPayload,
} from "@/lib/main-menu/resolve-main-bottom-nav";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const { data, error } = await sb
    .from("admin_settings")
    .select("value_json, updated_at")
    .eq("key", MAIN_BOTTOM_NAV_SETTINGS_KEY)
    .maybeSingle();

  if (error) {
    if (error.message?.includes("admin_settings") && error.message.includes("does not exist")) {
      return NextResponse.json({ ok: false, error: "table_missing" }, { status: 503 });
    }
    console.error("[GET admin main-bottom-nav]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const valueJson = data?.value_json ?? null;
  const fromDb = valueJson != null && typeof valueJson === "object";

  return NextResponse.json({
    ok: true as const,
    from_db: fromDb,
    updated_at: data?.updated_at ?? null,
    items: resolveMainBottomNavAdminRows(valueJson),
    preview_visible: resolveMainBottomNavDisplayItems(valueJson),
  });
}

export async function PUT(req: NextRequest) {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const validated = validateMainBottomNavPayload(body);
  if (!validated.ok) {
    return NextResponse.json({ ok: false, error: validated.error }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const { data: beforeRow } = await sb
    .from("admin_settings")
    .select("value_json")
    .eq("key", MAIN_BOTTOM_NAV_SETTINGS_KEY)
    .maybeSingle();

  const { error } = await sb.from("admin_settings").upsert(
    {
      key: MAIN_BOTTOM_NAV_SETTINGS_KEY,
      value_json: validated.payload as unknown as Record<string, unknown>,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" }
  );

  if (error) {
    if (error.message?.includes("admin_settings") && error.message.includes("does not exist")) {
      return NextResponse.json({ ok: false, error: "table_missing" }, { status: 503 });
    }
    console.error("[PUT admin main-bottom-nav]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const actorId = await getRouteUserId();
  const rm = getAuditRequestMeta(req);
  void appendAuditLog(sb, {
    actor_type: "admin",
    actor_id: actorId,
    target_type: "main_bottom_nav",
    target_id: "global",
    action: "main_bottom_nav.update",
    before_json: beforeRow?.value_json != null ? { value_json: beforeRow.value_json } : null,
    after_json: { value_json: validated.payload },
    ip: rm.ip,
    user_agent: rm.userAgent,
  });

  return NextResponse.json({
    ok: true as const,
    from_db: true,
    items: resolveMainBottomNavAdminRows(validated.payload),
    preview_visible: resolveMainBottomNavDisplayItems(validated.payload),
  });
}

/** DB 행 제거 → 앱은 코드 기본 하단 탭 사용 */
export async function DELETE(req: NextRequest) {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const { data: beforeRow } = await sb
    .from("admin_settings")
    .select("value_json")
    .eq("key", MAIN_BOTTOM_NAV_SETTINGS_KEY)
    .maybeSingle();

  const { error } = await sb.from("admin_settings").delete().eq("key", MAIN_BOTTOM_NAV_SETTINGS_KEY);

  if (error) {
    if (error.message?.includes("admin_settings") && error.message.includes("does not exist")) {
      return NextResponse.json({ ok: false, error: "table_missing" }, { status: 503 });
    }
    console.error("[DELETE admin main-bottom-nav]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const actorId = await getRouteUserId();
  const rm = getAuditRequestMeta(req);
  void appendAuditLog(sb, {
    actor_type: "admin",
    actor_id: actorId,
    target_type: "main_bottom_nav",
    target_id: "global",
    action: "main_bottom_nav.reset",
    before_json: beforeRow?.value_json != null ? { value_json: beforeRow.value_json } : null,
    after_json: { reset: true },
    ip: rm.ip,
    user_agent: rm.userAgent,
  });

  const defaults = getDefaultMainBottomNavAdminRows();
  return NextResponse.json({
    ok: true as const,
    from_db: false,
    items: defaults,
    preview_visible: resolveMainBottomNavDisplayItems(null),
  });
}
