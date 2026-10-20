import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { requireSuperAdmin } from "@/lib/admin/require-admin-permission";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { isProductionDeploy } from "@/lib/config/deploy-surface";
import { loadFeedEmergencyBundleFromDb, saveFeedEmergencyBundleToDb } from "@/lib/feed-emergency/feed-emergency-db";
import type { FeedEmergencyBundleV1 } from "@/lib/feed-emergency/feed-emergency-state";
import { createDefaultFeedEmergencyBundle } from "@/lib/feed-emergency/feed-emergency-state";
import { ADMIN_REASON_REQUIRED_CODE, parseAdminReason } from "@/lib/admin/operator-ux/admin-reason";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isBundle(x: unknown): x is FeedEmergencyBundleV1 {
  if (x == null || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return o.version === 1 && Array.isArray(o.policies) && Array.isArray(o.fallbackStates);
}

/**
 * 긴급 스위치 상태 — 킬스위치·Fallback 모드·섹션 강제 비활성만 (공지 문구·모드 선택 등 설정 편집은 제외).
 * 이 값이 바뀌는 저장은 긴급 차단(emergencyBlock · L3)이라 처리 사유가 필수다.
 */
function emergencySwitchState(b: FeedEmergencyBundleV1): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const p of b.policies ?? []) out[`kill_switch:${p.surface}`] = p.killSwitchEnabled === true;
  for (const f of b.fallbackStates ?? []) out[`fallback:${f.surface}`] = f.currentMode === "fallback";
  for (const o of b.sectionOverrides ?? []) {
    if (o.isForcedDisabled) out[`section:${o.surface}:${o.sectionKey}`] = true;
  }
  return out;
}

function changedEmergencySwitches(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): Record<string, { before: unknown; after: unknown }> {
  const changed: Record<string, { before: unknown; after: unknown }> = {};
  for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const a = before[k] ?? false;
    const b = after[k] ?? false;
    if (a !== b) changed[k] = { before: a, after: b };
  }
  return changed;
}

/** 관리자: 피드 긴급 상태 조회 */
export async function GET() {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  try {
    const sb = getSupabaseServer();
    const loaded = await loadFeedEmergencyBundleFromDb(sb);
    if (loaded.ok) {
      return NextResponse.json({
        ok: true,
        bundle: loaded.bundle,
        source: loaded.source,
      });
    }
    if (loaded.reason === "missing_table") {
      return NextResponse.json({
        ok: true,
        bundle: createDefaultFeedEmergencyBundle(),
        source: "default" as const,
        hint: loaded.message ?? "admin_settings 없음",
      });
    }
    return NextResponse.json(
      { ok: false, error: loaded.message ?? "load_failed" },
      { status: 500 }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!isProductionDeploy()) {
      return NextResponse.json({
        ok: true,
        bundle: createDefaultFeedEmergencyBundle(),
        source: "default" as const,
        hint: msg,
      });
    }
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 503 });
  }
}

/** 관리자: 피드 긴급 상태 저장 */
export async function PUT(req: NextRequest) {
  const admin = await requireSuperAdmin();
  if (!admin.ok) return admin.response;

  let body: { bundle?: unknown; reason?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (!isBundle(body.bundle)) {
    return NextResponse.json({ ok: false, error: "invalid_bundle" }, { status: 400 });
  }

  const reason = parseAdminReason(body.reason);

  try {
    const sb = getSupabaseServer();
    // 저장 전 상태와 비교해 긴급 스위치가 바뀌면 사유 필수 (화면 confirmAdminAction emergencyBlock L3 사유).
    const loaded = await loadFeedEmergencyBundleFromDb(sb);
    const beforeBundle = loaded.ok ? loaded.bundle : createDefaultFeedEmergencyBundle();
    const switchChanges = changedEmergencySwitches(emergencySwitchState(beforeBundle), emergencySwitchState(body.bundle));
    const switchChanged = Object.keys(switchChanges).length > 0;
    if (switchChanged && !reason) {
      return NextResponse.json({ ok: false, error: ADMIN_REASON_REQUIRED_CODE }, { status: 400 });
    }
    const saved = await saveFeedEmergencyBundleToDb(sb, body.bundle);
    if (!saved.ok) {
      return NextResponse.json({ ok: false, error: saved.error }, { status: 503 });
    }
    await appendAdminRouteAudit(admin.sb, req, {
      actorId: admin.actor.userId,
      targetType: "feed_emergency",
      targetId: "",
      action: "feed_emergency.update",
      ...(switchChanged ? { before: { switches: switchChanges } } : {}),
      after: {
        bundle: body.bundle as unknown as Record<string, unknown>,
        ...(reason ? { reason } : {}),
      },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 503 });
  }
}
