import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiActor } from "@/lib/admin/require-admin-permission";
import { markAdminNotificationsRead } from "@/lib/admin/notifications/admin-notification-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/inbox/read — mark the caller's own admin notifications read.
 * Body: { ids: string[] } | { all: true }
 * Only admin_notifications.read_at changes; business workload status is never touched.
 */
export async function POST(req: NextRequest) {
  const gate = await requireAdminApiActor();
  if (!gate.ok) return gate.response;

  let body: { ids?: unknown; all?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const ids = Array.isArray(body.ids) ? body.ids.map((v) => String(v ?? "")) : [];
  const r = await markAdminNotificationsRead(gate.sb, {
    adminUserId: gate.actor.userId,
    ids,
    all: body.all === true,
  });
  if (!r.ok) {
    return NextResponse.json({ ok: false, error: r.error }, { status: r.error === "nothing_to_mark" ? 400 : 500 });
  }
  return NextResponse.json({ ok: true, updated: r.updated });
}
