import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";
import { LAUNCH_INTRO_PUBLIC_BUCKET } from "@/lib/launch-intro/document";
import {
  createLaunchIntroPoolCreative,
  listLaunchIntroPoolRows,
  loadLaunchIntroPoolPolicy,
  loadLaunchIntroPoolStats,
} from "@/lib/launch-intro/pool-server";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 진입 감사 5단계 IN-3 — 인트로 소재 묶음 목록 + 최근 30일 기록 + 전체 설정 */
export async function GET() {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  const [rows, policy] = await Promise.all([listLaunchIntroPoolRows(sb), loadLaunchIntroPoolPolicy(sb)]);
  if (!rows.ok) return NextResponse.json({ ok: false, error: rows.error }, { status: rows.status ?? 500 });
  if (!policy.ok) return NextResponse.json({ ok: false, error: policy.error }, { status: policy.status ?? 500 });
  const stats = await loadLaunchIntroPoolStats(
    sb,
    rows.rows.filter((r) => r.status !== "ended").map((r) => r.id)
  );
  return NextResponse.json({
    ok: true,
    policy: policy.policy,
    policyRevision: policy.revision,
    items: rows.rows.map((r) => ({
      ...r,
      image_url: sb.storage.from(LAUNCH_INTRO_PUBLIC_BUCKET).getPublicUrl(r.image_path).data.publicUrl,
      stats: stats[r.id] ?? { impression: 0, skip: 0, click: 0, complete: 0 },
    })),
  });
}

/** 새 소재 — 그림은 기존 인트로 업로드(start → PUT → finish)로 올린 초안 경로를 넘긴다 */
export async function POST(req: NextRequest) {
  const gate = await requireAdminPermission("ads");
  if (!gate.ok) return gate.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  const res = await createLaunchIntroPoolCreative(sb, body, gate.actor.userId);
  if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: res.status ?? 500 });
  await appendAdminRouteAudit(sb, req, {
    actorId: gate.actor.userId,
    targetType: "launch_intro_creative",
    targetId: res.row.id,
    action: "launch_intro_creative.create",
    after: res.row as unknown as Record<string, unknown>,
  });
  return NextResponse.json({ ok: true, item: res.row });
}
