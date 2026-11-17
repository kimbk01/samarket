import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";
import { LAUNCH_INTRO_PUBLIC_BUCKET } from "@/lib/launch-intro/document";
import { computeLaunchIntroPoolApplied } from "@/lib/launch-intro/pool";
import {
  createLaunchIntroPoolCreative,
  duplicateLaunchIntroPoolCreative,
  listLaunchIntroPoolRows,
  loadLaunchIntroPoolPolicy,
  loadLaunchIntroPoolStats,
} from "@/lib/launch-intro/pool-server";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 진입 감사 5단계 IN-3 — 인트로 소재 묶음 목록 + 최근 30일 기록 + 전체 설정.
 * 앱 진입 어드민 v3 §3: 소재마다 `applied`(앱에 나오나 · 이유) — 기기 발견 응답과 같은 규칙
 * (`computeLaunchIntroPoolApplied` → `selectLiveLaunchIntroPoolRows`)을 서버에서 계산한다. 화면은 계산하지 않는다.
 */
export async function GET() {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  const [rows, policy] = await Promise.all([listLaunchIntroPoolRows(sb), loadLaunchIntroPoolPolicy(sb)]);
  if (!rows.ok) return NextResponse.json({ ok: false, error: rows.error }, { status: rows.status ?? 500 });
  if (!policy.ok) return NextResponse.json({ ok: false, error: policy.error }, { status: policy.status ?? 500 });
  const now = new Date();
  const applied = computeLaunchIntroPoolApplied(rows.rows, policy.policy, now);
  const statIds = rows.rows.filter((r) => r.status !== "ended").map((r) => r.id);
  const stats = await loadLaunchIntroPoolStats(sb, statIds);
  return NextResponse.json({
    ok: true,
    policy: policy.policy,
    policyRevision: policy.revision,
    computedAt: now.toISOString(),
    items: rows.rows.map((r) => ({
      ...r,
      image_url: sb.storage.from(LAUNCH_INTRO_PUBLIC_BUCKET).getPublicUrl(r.image_path).data.publicUrl,
      // 기록은 켜짐·꺼짐 소재 최대 20개만 센다(재감사 M2) — 세지 않은 소재는 null(화면 「—」)
      stats: stats[r.id] ?? null,
      applied: applied[r.id],
    })),
  });
}

/**
 * 새 소재 — 그림은 기존 인트로 업로드(start → PUT → finish)로 올린 초안 경로를 넘긴다.
 * 복제 — `{ duplicateOf: id, name }` (같은 그림 · 꺼짐 · 맨 뒤 순서).
 */
export async function POST(req: NextRequest) {
  const gate = await requireAdminPermission("ads");
  if (!gate.ok) return gate.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  const duplicateOf = body.duplicateOf;
  if (duplicateOf !== undefined && (typeof duplicateOf !== "string" || !UUID_RE.test(duplicateOf))) {
    return NextResponse.json({ ok: false, error: "id_invalid" }, { status: 400 });
  }
  const isDuplicate = typeof duplicateOf === "string";
  const res = isDuplicate
    ? await duplicateLaunchIntroPoolCreative(sb, duplicateOf, body.name, gate.actor.userId)
    : await createLaunchIntroPoolCreative(sb, body, gate.actor.userId);
  if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: res.status ?? 500 });
  await appendAdminRouteAudit(sb, req, {
    actorId: gate.actor.userId,
    targetType: "launch_intro_creative",
    targetId: res.row.id,
    action: isDuplicate ? "launch_intro_creative.duplicate" : "launch_intro_creative.create",
    after: { ...(res.row as unknown as Record<string, unknown>), ...(isDuplicate ? { duplicateOf } : {}) },
  });
  return NextResponse.json({ ok: true, item: res.row });
}
