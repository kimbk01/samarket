import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin/require-admin-permission";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIST_SELECT =
  "id, kind, user_id, store_id, product_id, status, refund_status, point_amount, cash_amount_minor, transaction_id, environment, review_reason, verified_via, created_at, credited_at, refund_notified_at, refund_decided_at";

/**
 * GET /api/admin/apple-iap?filter=attention|refund|all  (·`txn=<Apple 거래번호>` — 충전 신청·원장 화면에서 그 거래 1건)
 * attention = 지급 확인 중(received)·검토(review)·환불 검토 · refund = 환불 기록이 있는 거래 · all = 최근 200건
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;
  const filter = req.nextUrl.searchParams.get("filter") ?? "attention";
  const txn = (req.nextUrl.searchParams.get("txn") ?? "").replace(/^apple:/, "").trim();

  let q = guard.sb.from("apple_iap_transactions").select(LIST_SELECT).order("updated_at", { ascending: false }).limit(200);
  if (txn) {
    q = q.eq("transaction_id", txn);
  } else if (filter === "attention") {
    q = q.or("status.in.(received,review),refund_status.in.(review,reversed_review)");
  } else if (filter === "refund") {
    q = q.neq("refund_status", "none");
  }
  const { data, error } = await q;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const rows = (data ?? []) as Record<string, unknown>[];

  const userIds = [...new Set(rows.map((r) => String(r.user_id)))];
  const storeIds = [...new Set(rows.map((r) => r.store_id).filter(Boolean).map(String))];
  const [profiles, stores] = await Promise.all([
    userIds.length
      ? guard.sb.from("profiles").select("id, nickname").in("id", userIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    storeIds.length
      ? guard.sb.from("stores").select("id, store_name").in("id", storeIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);
  const nick = new Map(((profiles.data ?? []) as Record<string, unknown>[]).map((p) => [String(p.id), String(p.nickname ?? "")]));
  const storeName = new Map(((stores.data ?? []) as Record<string, unknown>[]).map((s) => [String(s.id), String(s.store_name ?? "")]));

  return NextResponse.json({
    ok: true,
    rows: rows.map((r) => ({
      ...r,
      user_nickname: nick.get(String(r.user_id)) ?? null,
      store_name: r.store_id ? storeName.get(String(r.store_id)) ?? null : null,
    })),
  });
}
