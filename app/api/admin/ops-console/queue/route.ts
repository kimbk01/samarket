import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { parseDeliveryListPage } from "@/lib/admin/delivery-list/delivery-list-page";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TABS = ["risk", "sla", "riders", "settlements", "incidents"] as const;
const FOCUS = ["all", "critical", "sla", "rider_issues", "settlements", "refund", "attention", "mine"] as const;
const GROUPS = ["none", "store", "rider", "region"] as const;

function pick<T extends string>(raw: string | null, allowed: readonly T[], fallback: T): T {
  const v = (raw ?? "").trim();
  return (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

function isMissingFunction(msg: string): boolean {
  return /function .* does not exist|Could not find the function|schema cache/i.test(msg);
}

/**
 * GET — 실시간 상황판 큐 (R7 서버 페이지네이션).
 * `admin_ops_console_queue_page` 가 여러 출처(SLA·ETA 초과·미배정·장시간 배달·보류 정산·환불 요청·긴급 표시)를
 * 주문 단위로 DB 에서 합치고, 우선순위 점수·포커스·그룹 정렬·limit/offset·정확한 total 을 계산한다.
 * 쿼리: tab · focus · group · limit(≤100) · offset. 「내 담당」 기준 = 로그인 관리자.
 */
export async function GET(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 503 });
  }

  const sp = req.nextUrl.searchParams;
  const page = parseDeliveryListPage(sp);
  const tab = pick(sp.get("tab"), TABS, "risk");
  const focus = pick(sp.get("focus"), FOCUS, "all");
  const group = pick(sp.get("group"), GROUPS, "store");

  const { data, error } = await (sb as any).rpc("admin_ops_console_queue_page", {
    p_tab: tab,
    p_focus: focus,
    p_group: group,
    p_viewer: admin.userId || null,
    p_limit: page.limit,
    p_offset: page.offset,
  });
  if (error) {
    const msg = String(error.message ?? "");
    if (isMissingFunction(msg)) {
      return NextResponse.json(
        { ok: false, error: "rpc_missing", hint: "Apply migration 20270601132000_r7_ops_console_queue_page" },
        { status: 503 }
      );
    }
    console.error("[admin ops-console queue]", msg.slice(0, 240));
    return NextResponse.json({ ok: false, error: "load_failed" }, { status: 500 });
  }

  const d = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const rows = Array.isArray(d.rows) ? d.rows : [];
  const totalNum = Number(d.total);
  return NextResponse.json({
    ok: true,
    generated_at: typeof d.generated_at === "string" ? d.generated_at : new Date().toISOString(),
    rows,
    total: Number.isFinite(totalNum) && totalNum >= 0 ? totalNum : rows.length,
    limit: page.limit,
    offset: page.offset,
    tab_counts: d.tab_counts && typeof d.tab_counts === "object" ? d.tab_counts : {},
    queue_counts: d.queue_counts && typeof d.queue_counts === "object" ? d.queue_counts : {},
    query: { tab, focus, group },
  });
}
