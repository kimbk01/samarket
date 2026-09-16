/**
 * POST /api/admin/stores/[storeId]/notify
 * Store-scoped Admin → Owner operational notice.
 * Recipient derived from stores.owner_user_id only (no client owner id).
 */
import { NextRequest, NextResponse } from "next/server";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { appendUserNotification } from "@/lib/notifications/append-user-notification";
import { OwnerRoutes } from "@/lib/business/owner-routes";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  title?: string;
  body?: string;
  deep_link?: string | null;
};

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ storeId: string }> }
) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const { storeId } = await context.params;
  const sid = typeof storeId === "string" ? storeId.trim() : "";
  if (!sid) {
    return NextResponse.json({ ok: false, error: "missing_store_id" }, { status: 400 });
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const title = String(body.title ?? "").trim().slice(0, 120);
  const message = String(body.body ?? "").trim().slice(0, 2000);
  if (!title || !message) {
    return NextResponse.json({ ok: false, error: "title_body_required" }, { status: 400 });
  }
  const deepLink =
    typeof body.deep_link === "string" && body.deep_link.trim()
      ? body.deep_link.trim().slice(0, 300)
      : OwnerRoutes.hub();

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const { data: store, error: sErr } = await sb
    .from("stores")
    .select("id, owner_user_id, store_name")
    .eq("id", sid)
    .maybeSingle();
  if (sErr || !store) {
    return NextResponse.json({ ok: false, error: "store_not_found" }, { status: 404 });
  }
  const ownerUserId = String((store as { owner_user_id?: string }).owner_user_id ?? "").trim();
  if (!ownerUserId) {
    return NextResponse.json({ ok: false, error: "store_owner_missing" }, { status: 409 });
  }

  const dedupe = `admin:store_ops_notice:${sid}:${admin.userId}:${Date.now()}`;
  const sent = await appendUserNotification(sb, {
    user_id: ownerUserId,
    notification_type: "system",
    domain: "store",
    ref_id: sid,
    push_kind: "notice",
    dedupe_key: dedupe,
    title,
    body: message,
    link_url: deepLink,
    meta: {
      kind: "admin_store_operational_notice",
      store_id: sid,
      store_name: (store as { store_name?: string }).store_name ?? null,
      source: "admin_store_notify",
      admin_actor_id: admin.userId,
    },
  });
  if (!sent) {
    return NextResponse.json({ ok: false, error: "notification_failed" }, { status: 500 });
  }

  const rm = getAuditRequestMeta(req);
  await appendAuditLog(sb, {
    actor_type: "admin",
    actor_id: admin.userId,
    target_type: "store",
    target_id: sid,
    action: "store.admin_operational_notice",
    after_json: {
      owner_user_id: ownerUserId,
      title,
      body: message,
      deep_link: deepLink,
      dedupe_key: dedupe,
    },
    ip: rm.ip ?? null,
    user_agent: rm.userAgent ?? null,
  });

  return NextResponse.json({
    ok: true,
    owner_user_id: ownerUserId,
    dedupe_key: dedupe,
  });
}
