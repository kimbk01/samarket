import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { requireSuperAdmin } from "@/lib/admin/require-admin-permission";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";
import { ADMIN_REASON_REQUIRED_CODE, parseAdminReason } from "@/lib/admin/operator-ux/admin-reason";
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

const CAPABILITIES_COLUMNS =
  "singleton, pg_version, pg_version_num, supports_pg_cron, supports_publication_column_filter, supports_advanced_rpc, supports_advisory_lock, supports_realtime_optimization, checked_at, updated_at";

/**
 * 기능 감지 RPC → 실패하면 마지막 저장 행을 읽는다.
 * 원인(2026-10-30 코드 확인): `detect_platform_runtime_capabilities` 본문의 `return (select * from …)` 는
 * 여러 열을 스칼라 서브쿼리로 돌려 PostgreSQL 42601 「subquery must return only one column」 으로 항상 실패한다
 * (20260522130000 마이그레이션). 함수 수정은 운영 DB 마이그레이션(Owner 승인)이라 여기서는 화면이 죽지 않게만 한다.
 */
async function loadCapabilities(
  sb: ReturnType<typeof getSupabaseServer>,
  force: boolean
): Promise<
  | { ok: true; capabilities: CapabilitiesRow | null; detectError: string | null }
  | { ok: false; schemaMissing: boolean; message: string }
> {
  const capRes = await (sb as any).rpc("detect_platform_runtime_capabilities", { p_force: force });
  if (!capRes.error) return { ok: true, capabilities: (capRes.data ?? null) as CapabilitiesRow | null, detectError: null };
  const msg = String(capRes.error.message ?? "");
  if (/does not exist|schema cache/i.test(msg) && !/subquery/i.test(msg)) {
    return { ok: false, schemaMissing: true, message: msg };
  }
  const rowRes = await (sb as any)
    .from("platform_runtime_capabilities")
    .select(CAPABILITIES_COLUMNS)
    .eq("singleton", 1)
    .maybeSingle();
  if (rowRes.error) return { ok: false, schemaMissing: false, message: msg };
  return { ok: true, capabilities: (rowRes.data ?? null) as CapabilitiesRow | null, detectError: msg.slice(0, 200) };
}

/** 감지 실패 시: 저장된 감지 결과가 없으면(checked_at 없음) 「미지원」 으로 단정하지 않고 설정값 그대로 둔다. */
function effectiveWithDetect(
  caps: CapabilitiesRow | null,
  settings: RuntimeSettingsRow,
  detectError: string | null
): { effective: RuntimeSettingsRow; warnings: { code: string; message: string }[] } {
  if (!detectError) return computeEffectiveSettings(caps, settings);
  const detectWarning = {
    code: "capabilities_detect_failed",
    message: caps?.checked_at
      ? "데이터베이스 기능 자동 감지에 실패해 마지막으로 확인된 값으로 표시합니다."
      : "데이터베이스 기능 자동 감지에 실패했습니다. 지원 여부는 확인되지 않았고 설정값을 그대로 표시합니다.",
  };
  if (!caps?.checked_at) return { effective: { ...settings }, warnings: [detectWarning] };
  const r = computeEffectiveSettings(caps, settings);
  return { effective: r.effective, warnings: [detectWarning, ...r.warnings] };
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

  // 1) capabilities detect (TTL 내부 처리) — 감지 실패 시 저장 행으로 대체 (loadCapabilities 주석)
  const capLoad = await loadCapabilities(sb, force);
  if (!capLoad.ok) {
    if (capLoad.schemaMissing) {
      return NextResponse.json(
        { ok: false, error: "schema_missing_platform_runtime_capabilities", hint: "Apply migration platform_runtime_capabilities_and_settings" },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { ok: false, error: "capabilities_load_failed", hint: capLoad.message.slice(0, 200) },
      { status: 500 }
    );
  }
  const capabilities = capLoad.capabilities;

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

  const { effective, warnings } = effectiveWithDetect(capabilities, settings, capLoad.detectError);

  return NextResponse.json({
    ok: true,
    capabilities,
    settings,
    effective,
    warnings,
    ...(capLoad.detectError ? { hint: capLoad.detectError } : {}),
  });
}

export async function PATCH(req: NextRequest) {
  const admin = await requireSuperAdmin();
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

  // R2 — 런타임 설정 변경은 L2(확인 + 사유). 화면 확인창의 사유를 받아 감사 기록에 남긴다 (호출자: 런타임 상태 화면 1곳).
  const reason = parseAdminReason((body as { reason?: unknown }).reason);
  if (!reason) {
    return NextResponse.json({ ok: false, error: ADMIN_REASON_REQUIRED_CODE }, { status: 400 });
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

  await appendAdminRouteAudit(admin.sb, req, {
    actorId: admin.actor.userId,
    targetType: "platform_runtime_settings",
    targetId: "1",
    action: "runtime_settings.update",
    after: { patch, settings: settings as unknown as Record<string, unknown>, reason },
  });

  // reload caps (no force) for effective computation
  const capLoad = await loadCapabilities(sb, false);
  const capabilities = capLoad.ok ? capLoad.capabilities : null;
  const { effective, warnings } = effectiveWithDetect(
    capabilities,
    settings,
    capLoad.ok ? capLoad.detectError : capLoad.message.slice(0, 200)
  );

  return NextResponse.json({ ok: true, settings, effective, warnings, capabilities });
}

