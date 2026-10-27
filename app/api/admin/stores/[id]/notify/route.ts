/**
 * POST /api/admin/stores/[id]/notify
 * Store-scoped Admin → Owner operational notice.
 * Recipient derived from stores.owner_user_id only (no client owner id).
 */
import { NextRequest, NextResponse } from "next/server";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { appendUserNotification } from "@/lib/notifications/append-user-notification";
import { OwnerRoutes } from "@/lib/business/owner-routes";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  title?: string;
  body?: string;
  deep_link?: string | null;
  /** N-14 — compose 1회 = 발송 1회 (같은 request_id 재전송은 dedupe) */
  request_id?: string | null;
};

const REQUEST_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  // N-14 — 매장 운영 공지 = 매장·재무 운영 권한(business)
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;
  const admin = { userId: gate.actor.userId };

  const { id } = await context.params;
  const sid = typeof id === "string" ? id.trim() : "";
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
  // 앱 내부 경로만 허용 (외부·프로토콜 상대 URL 은 오너 허브로 대체)
  const rawLink = typeof body.deep_link === "string" ? body.deep_link.trim().slice(0, 300) : "";
  const deepLink =
    rawLink.startsWith("/") && !rawLink.startsWith("//") && !rawLink.includes("\\")
      ? rawLink
      : OwnerRoutes.hub();
  const requestId = typeof body.request_id === "string" ? body.request_id.trim() : "";
  // D-7 (재감사 P-9): 작성 1회 = 발송 1회. 요청 id 없이 현재 시각으로 키를 만들던 대체 경로 제거.
  if (!REQUEST_ID_RE.test(requestId)) {
    return NextResponse.json({ ok: false, error: "request_id_required" }, { status: 400 });
  }

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

  const dedupe = `admin:store_ops_notice:${sid}:${requestId}`;
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
