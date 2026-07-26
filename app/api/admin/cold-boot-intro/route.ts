import { NextRequest, NextResponse } from "next/server";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import {
  COLD_BOOT_INTRO_SETTINGS_KEY,
  DEFAULT_COLD_BOOT_INTRO_CONFIG,
  normalizeColdBootIntroConfig,
} from "@/lib/app-boot/cold-boot-intro-config";
import {
  loadColdBootIntroConfigFromDb,
  saveColdBootIntroConfigToDb,
} from "@/lib/app-boot/cold-boot-intro-db";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

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
  const loaded = await loadColdBootIntroConfigFromDb(sb);
  if (!loaded.ok) {
    if (loaded.reason === "missing_table") {
      return NextResponse.json({ ok: false, error: "table_missing" }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: loaded.message ?? "error" }, { status: 500 });
  }
  return NextResponse.json({ ok: true as const, source: loaded.source, config: loaded.config });
}

export async function PUT(req: NextRequest) {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
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
  const config = normalizeColdBootIntroConfig(configRaw ?? DEFAULT_COLD_BOOT_INTRO_CONFIG);

  const { data: beforeRow } = await sb
    .from("admin_settings")
    .select("value_json")
    .eq("key", COLD_BOOT_INTRO_SETTINGS_KEY)
    .maybeSingle();

  const saved = await saveColdBootIntroConfigToDb(sb, config);
  if (!saved.ok) {
    return NextResponse.json({ ok: false, error: saved.error }, { status: 500 });
  }

  const meta = getAuditRequestMeta(req);
  void appendAuditLog(sb, {
    actor_type: "admin",
    actor_id: userId,
    action: "cold_boot_intro.update",
    target_type: "admin_settings",
    target_id: COLD_BOOT_INTRO_SETTINGS_KEY,
    before_json: beforeRow?.value_json != null ? { value_json: beforeRow.value_json } : null,
    after_json: { enabled: config.enabled, wordmark: config.wordmark },
    ip: meta.ip,
    user_agent: meta.userAgent,
  });

  const reloaded = await loadColdBootIntroConfigFromDb(sb);
  return NextResponse.json({
    ok: true as const,
    config: reloaded.ok ? reloaded.config : config,
  });
}
