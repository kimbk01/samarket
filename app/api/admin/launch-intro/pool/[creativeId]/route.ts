import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";
import { deleteLaunchIntroPoolCreative, updateLaunchIntroPoolCreative } from "@/lib/launch-intro/pool-server";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 수정 — `expectedUpdatedAt`(읽은 판)과 다르면 409 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ creativeId: string }> }) {
  const gate = await requireAdminPermission("ads");
  if (!gate.ok) return gate.response;
  const { creativeId } = await ctx.params;
  if (!UUID_RE.test(creativeId)) return NextResponse.json({ ok: false, error: "id_invalid" }, { status: 400 });
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  const { expectedUpdatedAt, ...patch } = body;
  const res = await updateLaunchIntroPoolCreative(
    sb,
    creativeId,
    patch,
    typeof expectedUpdatedAt === "string" ? expectedUpdatedAt : null
  );
  if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: res.status ?? 500 });
  await appendAdminRouteAudit(sb, req, {
    actorId: gate.actor.userId,
    targetType: "launch_intro_creative",
    targetId: creativeId,
    action: "launch_intro_creative.update",
    before: res.before as unknown as Record<string, unknown>,
    after: res.row as unknown as Record<string, unknown>,
  });
  return NextResponse.json({ ok: true, item: res.row });
}

/** 삭제 — 켜진 소재는 거절. 그림은 아무도 안 쓰면 지운다 */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ creativeId: string }> }) {
  const gate = await requireAdminPermission("ads");
  if (!gate.ok) return gate.response;
  const { creativeId } = await ctx.params;
  if (!UUID_RE.test(creativeId)) return NextResponse.json({ ok: false, error: "id_invalid" }, { status: 400 });
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  const res = await deleteLaunchIntroPoolCreative(sb, creativeId);
  if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: res.status ?? 500 });
  await appendAdminRouteAudit(sb, req, {
    actorId: gate.actor.userId,
    targetType: "launch_intro_creative",
    targetId: creativeId,
    action: "launch_intro_creative.delete",
    before: res.before as unknown as Record<string, unknown>,
  });
  return NextResponse.json({ ok: true });
}
