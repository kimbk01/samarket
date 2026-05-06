import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RuntimeSettingsRow = {
  singleton: number;
  enable_pg_cron: boolean;
  enable_realtime_optimization: boolean;
  enable_auto_actions: boolean;
  enable_alert_runner: boolean;
  enable_recovery_runner: boolean;
  enable_delivery_realtime_filtering: boolean;
  updated_at?: string | null;
};

type CapabilitiesRow = {
  singleton: number;
  pg_version: string | null;
  pg_version_num: number | null;
  supports_pg_cron: boolean;
  supports_publication_column_filter: boolean;
  supports_advanced_rpc: boolean;
  supports_advisory_lock: boolean;
  supports_realtime_optimization: boolean;
  checked_at?: string | null;
  updated_at?: string | null;
};

function coerceBool(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  return null;
}

function computeEffectiveSettings(
  caps: CapabilitiesRow | null,
  s: RuntimeSettingsRow
): {
  effective: RuntimeSettingsRow;
  warnings: { code: string; message: string }[];
} {
  const warnings: { code: string; message: string }[] = [];
  const supportsPgCron = caps?.supports_pg_cron ?? false;
  const supportsPubCols = caps?.supports_publication_column_filter ?? false;
  const supportsRtOpt = caps?.supports_realtime_optimization ?? false;

  const effective: RuntimeSettingsRow = {
    ...s,
    enable_pg_cron: s.enable_pg_cron && supportsPgCron,
    enable_realtime_optimization: s.enable_realtime_optimization && supportsRtOpt,
    enable_delivery_realtime_filtering: s.enable_delivery_realtime_filtering && supportsPubCols,
  };

  if (s.enable_pg_cron && !supportsPgCron) {
    warnings.push({
      code: "pg_cron_unsupported",
      message: "pg_cron 미지원: enable_pg_cron은 자동으로 비활성 처리됩니다.",
    });
  }
  if (s.enable_delivery_realtime_filtering && !supportsPubCols) {
    warnings.push({
      code: "publication_columns_unsupported",
      message: "publication 컬럼 필터 미지원(PG15+ 필요): enable_delivery_realtime_filtering은 자동으로 비활성 처리됩니다.",
    });
  }
  if (s.enable_realtime_optimization && !supportsRtOpt) {
    warnings.push({
      code: "realtime_optimization_unsupported",
      message: "Realtime 최적화 기능 미지원: enable_realtime_optimization은 자동으로 비활성 처리됩니다.",
    });
  }

  return { effective, warnings };
}

export async function GET(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const force = req.nextUrl.searchParams.get("force") === "1";

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 503 });
  }

  // 1) capabilities detect (TTL 내부 처리)
  const capRes = await (sb as any).rpc("detect_platform_runtime_capabilities", { p_force: force });
  if (capRes.error) {
    const msg = String(capRes.error.message ?? "");
    if (/does not exist|schema cache/i.test(msg)) {
      return NextResponse.json(
        { ok: false, error: "schema_missing_platform_runtime_capabilities", hint: "Apply migration platform_runtime_capabilities_and_settings" },
        { status: 503 }
      );
    }
    return NextResponse.json({ ok: false, error: msg.slice(0, 200) }, { status: 500 });
  }
  const capabilities = (capRes.data ?? null) as CapabilitiesRow | null;

  // 2) settings load
  const setRes = await (sb as any)
    .from("platform_runtime_settings")
    .select(
      "singleton, enable_pg_cron, enable_realtime_optimization, enable_auto_actions, enable_alert_runner, enable_recovery_runner, enable_delivery_realtime_filtering, updated_at"
    )
    .eq("singleton", 1)
    .maybeSingle();

  if (setRes.error) {
    const msg = String(setRes.error.message ?? "");
    if (/does not exist|schema cache/i.test(msg)) {
      return NextResponse.json(
        { ok: false, error: "schema_missing_platform_runtime_settings", hint: "Apply migration platform_runtime_capabilities_and_settings" },
        { status: 503 }
      );
    }
    return NextResponse.json({ ok: false, error: msg.slice(0, 200) }, { status: 500 });
  }

  const settings =
    (setRes.data as RuntimeSettingsRow | null) ?? ({
      singleton: 1,
      enable_pg_cron: true,
      enable_realtime_optimization: true,
      enable_auto_actions: false,
      enable_alert_runner: true,
      enable_recovery_runner: true,
      enable_delivery_realtime_filtering: true,
    } satisfies RuntimeSettingsRow);

  const { effective, warnings } = computeEffectiveSettings(capabilities, settings);

  return NextResponse.json({
    ok: true,
    capabilities,
    settings,
    effective,
    warnings,
  });
}

export async function PATCH(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  let body: Partial<RuntimeSettingsRow>;
  try {
    body = (await req.json()) as Partial<RuntimeSettingsRow>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  const fields: (keyof RuntimeSettingsRow)[] = [
    "enable_pg_cron",
    "enable_realtime_optimization",
    "enable_auto_actions",
    "enable_alert_runner",
    "enable_recovery_runner",
    "enable_delivery_realtime_filtering",
  ];
  for (const k of fields) {
    const b = coerceBool((body as any)[k]);
    if (b != null) patch[k] = b;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: false, error: "no_patch_fields" }, { status: 400 });
  }

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 503 });
  }

  const { data, error } = await (sb as any)
    .from("platform_runtime_settings")
    .update(patch)
    .eq("singleton", 1)
    .select(
      "singleton, enable_pg_cron, enable_realtime_optimization, enable_auto_actions, enable_alert_runner, enable_recovery_runner, enable_delivery_realtime_filtering, updated_at"
    )
    .maybeSingle();

  if (error) {
    const msg = String(error.message ?? "");
    if (/does not exist|schema cache/i.test(msg)) {
      return NextResponse.json({ ok: false, error: "schema_missing_platform_runtime_settings" }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: msg.slice(0, 200) }, { status: 500 });
  }

  const settings = (data ?? null) as RuntimeSettingsRow | null;
  if (!settings) return NextResponse.json({ ok: false, error: "settings_row_missing" }, { status: 500 });

  // reload caps (no force) for effective computation
  const capRes = await (sb as any).rpc("detect_platform_runtime_capabilities", { p_force: false });
  const capabilities = (capRes.data ?? null) as CapabilitiesRow | null;
  const { effective, warnings } = computeEffectiveSettings(capabilities, settings);

  return NextResponse.json({ ok: true, settings, effective, warnings, capabilities });
}

