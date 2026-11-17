import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";
import { validateLaunchIntroPoolPolicy } from "@/lib/launch-intro/pool";
import { saveLaunchIntroPoolPolicy } from "@/lib/launch-intro/pool-server";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 인트로 소재 묶음 전체 설정(켜기 · OS 종료 후 실행에도 보이기) — 읽은 판과 다르면 409 */
export async function PUT(req: NextRequest) {
  const gate = await requireAdminPermission("ads");
  if (!gate.ok) return gate.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const v = validateLaunchIntroPoolPolicy(body?.policy);
  if (!v.ok) return NextResponse.json({ ok: false, error: v.error }, { status: 400 });
  const expected = body?.expectedRevision;
  if (expected !== null && typeof expected !== "string") {
    return NextResponse.json({ ok: false, error: "invalid_expected_revision" }, { status: 400 });
  }
  const res = await saveLaunchIntroPoolPolicy(sb, v.policy, expected);
  if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: res.status ?? 500 });
  await appendAdminRouteAudit(sb, req, {
    actorId: gate.actor.userId,
    targetType: "launch_intro_pool_policy",
    targetId: "global",
    action: "launch_intro_pool_policy.update",
    before: res.before as unknown as Record<string, unknown>,
    after: v.policy as unknown as Record<string, unknown>,
  });
  return NextResponse.json({ ok: true, policy: v.policy, revision: res.revision });
}
