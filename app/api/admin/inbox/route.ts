import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiActor } from "@/lib/admin/require-admin-permission";
import {
  countUnreadAdminNotifications,
  listAdminNotifications,
  loadAdminNotificationDeliveryHealth,
  type AdminRecipientAuthority,
} from "@/lib/admin/notifications/admin-notification-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/inbox — ADMIN NOTIFICATION inbox (R13).
 *   ?summary=1          → { unread } only (header inbox badge)
 *   ?limit&before&unread=1 → page of the caller's own notifications
 *
 * HARD LOCK: inbox unread ≠ Admin Action Queue total (/api/admin/admin-bell).
 * Authority is re-resolved on every request (revoked admin → 401/403, rows stay stored).
 */
export async function GET(req: NextRequest) {
  const gate = await requireAdminApiActor();
  if (!gate.ok) return gate.response;

  const authority: AdminRecipientAuthority = {
    active: true,
    isSuperAdmin: gate.actor.isSuperAdmin,
    permissions: gate.actor.permissions,
  };
  const sp = req.nextUrl.searchParams;

  if (sp.get("summary") === "1") {
    const r = await countUnreadAdminNotifications(gate.sb, { adminUserId: gate.actor.userId, authority });
    if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 500 });
    // Delivery health (dead letters / backlog) is an operational surface — super admins only.
    let delivery: unknown = undefined;
    if (gate.actor.isSuperAdmin) {
      const h = await loadAdminNotificationDeliveryHealth(gate.sb);
      delivery = h.ok ? h.health : { unavailable: true };
    }
    return NextResponse.json({ ok: true, unread: r.unread, ...(delivery !== undefined ? { delivery } : {}) });
  }

  const before = sp.get("before")?.trim() || null;
  if (before && Number.isNaN(Date.parse(before))) {
    return NextResponse.json({ ok: false, error: "invalid_before" }, { status: 400 });
  }
  const r = await listAdminNotifications(gate.sb, {
    adminUserId: gate.actor.userId,
    authority,
    limit: Number(sp.get("limit")) || 30,
    before,
    unreadOnly: sp.get("unread") === "1",
  });
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 500 });
  return NextResponse.json({ ok: true, items: r.items, unread: r.unread, hasMore: r.hasMore });
}
