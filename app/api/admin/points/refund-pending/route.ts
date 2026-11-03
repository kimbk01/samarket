import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { POINT_REFUND_PENDING_ACTION } from "@/lib/points/refund-points-after-failed-purchase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/points/refund-pending — P1 환급 대기 감사.
 * 포인트 결제 후 적용이 실패했고 환급 RPC 도 실패해 남긴 기록(point_action_logs)과,
 * 같은 키(related_type:related_id)의 ad_refund 원장이 이후 생겼는지(resolved)를 함께 돌려준다.
 */
export async function GET(): Promise<NextResponse> {
  const gate = await requireAdminPermission("point");
  if (!gate.ok) return gate.response;

  const { data, error } = await gate.sb
    .from("point_action_logs")
    .select("id, target_user_id, related_id, note, created_at")
    .eq("action_type", POINT_REFUND_PENDING_ACTION)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ ok: false, error: "load_failed" }, { status: 500 });

  const items = [];
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const refundKey = String(row.related_id ?? "");
    const sep = refundKey.indexOf(":");
    const relatedType = sep > 0 ? refundKey.slice(0, sep) : "";
    const relatedId = sep > 0 ? refundKey.slice(sep + 1) : "";
    const userId = String(row.target_user_id ?? "");
    let resolvedLedgerId: string | null = null;
    if (relatedType && relatedId && userId) {
      const { data: refunded } = await gate.sb
        .from("point_ledger")
        .select("id")
        .eq("user_id", userId)
        .eq("entry_type", "ad_refund")
        .eq("related_type", relatedType)
        .eq("related_id", relatedId)
        .limit(1);
      resolvedLedgerId = Array.isArray(refunded) && refunded[0] ? String((refunded[0] as { id: string }).id) : null;
    }
    items.push({
      id: String(row.id ?? ""),
      userId,
      refundKey,
      note: String(row.note ?? ""),
      createdAt: String(row.created_at ?? ""),
      resolvedLedgerId,
    });
  }
  return NextResponse.json({
    ok: true,
    unresolved: items.filter((i) => !i.resolvedLedgerId).length,
    items,
  });
}
