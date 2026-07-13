import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import {
  CM_HOME_CUTOVER_GATE_SCHEMA_VERSION,
  createLegacyCmHomeCutoverGateConfig,
  normalizeCmHomeCutoverAllowlist,
  normalizeCmHomeCutoverPillarScope,
  type CmHomeCutoverGateConfigV1,
  type CmHomeCutoverState,
} from "@/lib/community-messenger/home/cm-home-cutover-gate-keys";
import {
  loadRawCmHomeCutoverGateConfig,
  saveCmHomeCutoverGateConfig,
} from "@/lib/community-messenger/home/cm-home-cutover-gate-db";
import { resolveCmHomeCutoverEffectiveGate } from "@/lib/community-messenger/home/cm-home-cutover-gate-resolver";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeStateStrict(raw: unknown): CmHomeCutoverState | null {
  const v = String(raw ?? "").trim().toUpperCase();
  if (v === "LEGACY" || v === "SHADOW_ONLY" || v === "CANONICAL" || v === "DUAL") return v;
  return null;
}

export async function GET() {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_service_unavailable" }, { status: 503 });
  }
  const loaded = await loadRawCmHomeCutoverGateConfig(sb);
  if (!loaded.ok) {
    // fail-closed: 테이블 없음/오류 시 LEGACY 기본 반환 (row 는 자동 생성하지 않음)
    const legacy = createLegacyCmHomeCutoverGateConfig();
    return NextResponse.json({
      ok: true,
      exists: false,
      reason: loaded.reason,
      raw: null,
      config: legacy,
    });
  }
  return NextResponse.json({
    ok: true,
    exists: loaded.source === "db",
    raw: loaded.raw,
    config: loaded.config,
  });
}

export async function PUT(request: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_service_unavailable" }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const state = normalizeStateStrict(body.state);
  if (state == null) {
    return NextResponse.json({ ok: false, error: "unknown_state" }, { status: 400 });
  }

  const cohortRaw = (body.cohort ?? {}) as Record<string, unknown>;
  const percentRaw = cohortRaw.percent;
  if (percentRaw != null && (typeof percentRaw !== "number" || !Number.isInteger(percentRaw))) {
    return NextResponse.json({ ok: false, error: "percent_must_be_integer" }, { status: 400 });
  }
  const percent = Math.min(100, Math.max(0, typeof percentRaw === "number" ? Math.floor(percentRaw) : 0));
  const allowlist = normalizeCmHomeCutoverAllowlist(cohortRaw.allowlist);
  const pillarScope = normalizeCmHomeCutoverPillarScope(body.pillarScope);
  const kill = body.kill === true;

  // 현재 값을 읽어 서버가 gateVersion 을 증가시킨다 (last-write-wins).
  const current = await loadRawCmHomeCutoverGateConfig(sb);
  const currentVersion = current.ok ? current.config.gateVersion : 0;

  const next: CmHomeCutoverGateConfigV1 = {
    schemaVersion: CM_HOME_CUTOVER_GATE_SCHEMA_VERSION,
    gateVersion: currentVersion + 1,
    state,
    kill,
    cohort: { percent, allowlist },
    pillarScope,
    updatedAt: new Date().toISOString(),
  };

  const saved = await saveCmHomeCutoverGateConfig(sb, next);
  if (!saved.ok) {
    return NextResponse.json({ ok: false, error: saved.error }, { status: 500 });
  }

  // normalized effective 미리보기 (관리자 확인용, 저장에는 영향 없음)
  const effectiveForAdmin = resolveCmHomeCutoverEffectiveGate(next, admin.userId);
  return NextResponse.json({ ok: true, config: next, effectivePreviewForAdmin: effectiveForAdmin });
}
