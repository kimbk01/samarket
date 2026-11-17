import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { NextRequest, NextResponse } from "next/server";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import {
  STARTUP_CONFIG_SETTINGS_KEY,
  BUNDLED_STARTUP_CONFIG,
  normalizeStartupConfig,
} from "@/lib/startup/startup-config";
import {
  loadStartupConfigFromDb,
  saveStartupConfigToDb,
} from "@/lib/startup/startup-config-db";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import {
  STARTUP_CONFIG_AUDIT_ACTION,
  loadStartupConfigLastChange,
} from "@/lib/admin/app-entry/startup-config-last-change";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  const loaded = await loadStartupConfigFromDb(sb);
  if (!loaded.ok) {
    if (loaded.reason === "missing_table") {
      return NextResponse.json({ ok: false, error: "table_missing" }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: loaded.message ?? "error" }, { status: 500 });
  }
  // 앱 진입 어드민 v3 §5: 마지막 변경 시각·관리자 (admin_settings.updated_at · audit_logs 최신 저장 행)
  const lastChange = await loadStartupConfigLastChange(sb);
  return NextResponse.json({ ok: true as const, source: loaded.source, config: loaded.config, lastChange });
}

export async function PUT(req: NextRequest) {
  // G-18: 앱 공통 설정 쓰기 = settings 키 (메뉴·CTA·API 동일 — admin-route-access.ts)
  const gate = await requireAdminPermission("settings");
  if (!gate.ok) return gate.response;
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const configRaw =
    body && typeof body === "object" && "config" in (body as object)
      ? (body as { config: unknown }).config
      : body;
  const config = normalizeStartupConfig(configRaw ?? BUNDLED_STARTUP_CONFIG);

  const { data: beforeRow } = await sb
    .from("admin_settings")
    .select("value_json")
    .eq("key", STARTUP_CONFIG_SETTINGS_KEY)
    .maybeSingle();

  const saved = await saveStartupConfigToDb(sb, config);
  if (!saved.ok) {
    return NextResponse.json({ ok: false, error: saved.error }, { status: 500 });
  }

  const meta = getAuditRequestMeta(req);
  // 기록을 남긴 뒤 마지막 변경(관리자)을 다시 읽어 응답에 싣는다 — 실패해도 저장 결과에는 영향 없음
  await appendAuditLog(sb, {
    actor_type: "admin",
    actor_id: userId,
    action: STARTUP_CONFIG_AUDIT_ACTION,
    target_type: "admin_settings",
    target_id: STARTUP_CONFIG_SETTINGS_KEY,
    before_json: beforeRow?.value_json != null ? { value_json: beforeRow.value_json } : null,
    after_json: {
      version: config.version,
      initialSurface: config.initialSurface,
      updatedAt: config.updatedAt,
    },
    ip: meta.ip,
    user_agent: meta.userAgent,
  });

  const [reloaded, lastChange] = await Promise.all([loadStartupConfigFromDb(sb), loadStartupConfigLastChange(sb)]);
  return NextResponse.json({
    ok: true as const,
    config: reloaded.ok ? reloaded.config : config,
    lastChange,
  });
}
