import { NextRequest, NextResponse } from "next/server";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import {
  BUNDLED_PRODUCT_INTRO_CONFIG,
  STARTUP_PRODUCT_INTRO_SETTINGS_KEY,
  normalizeProductIntroConfig,
} from "@/lib/startup/product-intro";
import {
  loadProductIntroFromDb,
  saveProductIntroToDb,
} from "@/lib/startup/product-intro-db";
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
  const loaded = await loadProductIntroFromDb(sb);
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
  const config = normalizeProductIntroConfig(configRaw ?? BUNDLED_PRODUCT_INTRO_CONFIG);

  if (config.status === "active" && !config.media.mobileUrl) {
    return NextResponse.json(
      { ok: false, error: "mobile_media_required_when_active" },
      { status: 400 }
    );
  }
  if (config.startsAt && config.endsAt) {
    const a = Date.parse(config.startsAt);
    const b = Date.parse(config.endsAt);
    if (Number.isFinite(a) && Number.isFinite(b) && b <= a) {
      return NextResponse.json({ ok: false, error: "invalid_schedule" }, { status: 400 });
    }
  }

  const { data: beforeRow } = await sb
    .from("admin_settings")
    .select("value_json")
    .eq("key", STARTUP_PRODUCT_INTRO_SETTINGS_KEY)
    .maybeSingle();

  const saved = await saveProductIntroToDb(sb, config);
  if (!saved.ok) {
    return NextResponse.json({ ok: false, error: saved.error }, { status: 500 });
  }

  const meta = getAuditRequestMeta(req);
  void appendAuditLog(sb, {
    actor_type: "admin",
    actor_id: userId,
    action: "startup_product_intro.update",
    target_type: "admin_settings",
    target_id: STARTUP_PRODUCT_INTRO_SETTINGS_KEY,
    before_json: beforeRow?.value_json != null ? { value_json: beforeRow.value_json } : null,
    after_json: {
      status: saved.config.status,
      name: saved.config.name,
      displayMode: saved.config.displayMode,
      sizePreset: saved.config.sizePreset,
      animationIn: saved.config.animationIn,
      animationOut: saved.config.animationOut,
      actionType: saved.config.action.type,
      version: saved.config.version,
    },
    ip: meta.ip,
    user_agent: meta.userAgent,
  });

  return NextResponse.json({ ok: true as const, config: saved.config });
}
