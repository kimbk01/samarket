import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { isUuid } from "@/lib/community-messenger/contacts/contacts-contract";
import { deleteContactsSource } from "@/lib/community-messenger/contacts/contacts-service.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ userId: string; sourceId: string }> };

/** DELETE — 회원 요청 대응: 그 기기 연락처 저장분 삭제 (사유 필수 · 감사 기록). 친구·숨김·차단은 그대로 */
export async function DELETE(req: Request, { params }: Ctx) {
  const gate = await requireAdminPermission("users");
  if (!gate.ok) return gate.response;
  const { userId, sourceId } = await params;
  if (!isUuid(userId) || !isUuid(sourceId)) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  let reason = "";
  try {
    reason = String(((await req.json()) as { reason?: unknown }).reason ?? "").trim();
  } catch {
    reason = "";
  }
  if (reason.length < 2 || reason.length > 300) return NextResponse.json({ ok: false, error: "reason_required" }, { status: 400 });
  const r = await deleteContactsSource(gate.sb, userId, sourceId);
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: r.error === "not_found" ? 404 : 500 });
  await appendAuditLog(gate.sb, {
    actor_type: "admin",
    actor_id: gate.actor.userId,
    target_type: "messenger_contact_source",
    target_id: sourceId,
    action: "messenger_contacts.admin_delete_source",
    after_json: { user_id: userId, reason },
  }).catch((e: unknown) => console.error("[admin contacts] audit", e));
  return NextResponse.json({ ok: true });
}
