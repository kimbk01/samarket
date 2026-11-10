import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin/require-admin-permission";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { recoverContactsFailuresNow } from "@/lib/community-messenger/contacts/contacts-service.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST — 재추천 제한 기록 실패분 「지금 복구」 (SSOT v5 §5-3 · 최고관리자).
 * 매일 정리와 같은 함수(행마다 따로 · 실패 횟수 기록 · 멱등). 결과는 감사 기록 1건.
 */
export async function POST() {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return gate.response;
  const r = await recoverContactsFailuresNow(gate.sb);
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 500 });
  await appendAuditLog(gate.sb, {
    actor_type: "admin",
    actor_id: gate.actor.userId,
    target_type: "messenger_contacts",
    target_id: "suppression_failures",
    action: "messenger_contacts.admin_recover_failures",
    after_json: r.value,
  }).catch((e: unknown) => console.error("[admin contacts-recover] audit", e));
  return NextResponse.json({ ok: true, ...r.value }, { headers: { "Cache-Control": "no-store" } });
}
