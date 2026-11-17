import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";
import { reorderLaunchIntroPoolCreatives, validateLaunchIntroPoolOrder } from "@/lib/launch-intro/pool-server";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 앱 진입 어드민 v3 §3 「순서 저장」 — 한 요청. body `{ items: [{ id, expectedUpdatedAt, sortOrder }] }`.
 * 읽은 판(updated_at)과 다른 행이 하나라도 있으면 409(다른 관리자 저장 덮어쓰기 금지).
 */
export async function PUT(req: NextRequest) {
  const gate = await requireAdminPermission("ads");
  if (!gate.ok) return gate.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const v = validateLaunchIntroPoolOrder(body?.items);
  if (!v.ok) return NextResponse.json({ ok: false, error: v.error }, { status: 400 });
  const res = await reorderLaunchIntroPoolCreatives(sb, v.items);
  if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: res.status ?? 500 });
  await appendAdminRouteAudit(sb, req, {
    actorId: gate.actor.userId,
    targetType: "launch_intro_pool_order",
    targetId: "global",
    action: "launch_intro_creative.reorder",
    before: res.before,
    after: res.after,
  });
  return NextResponse.json({ ok: true, changed: Object.keys(res.after).length });
}
