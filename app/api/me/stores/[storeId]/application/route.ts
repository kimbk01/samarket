import { NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { listStoreApplicationEvents } from "@/lib/stores/store-application-events.server";

/**
 * 사장님에게 보여 줄 수 있는 사유 — 사장님에게 알림으로 가는 결정만 (반려·보완 요청·재심사 열기·운영 중지).
 * 입점 승인·심사 시작 등의 사유는 관리자 내부 메모라 내보내지 않는다 (재감사 2026-11-10 누수).
 */
const OWNER_VISIBLE_REASON_ACTIONS = new Set(["reject_store", "request_revision", "reopen_application", "suspend_store"]);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APPLICATION_SELECT =
  "id, owner_user_id, store_name, branch_name, applicant_nickname, description, application_request_note, kakao_id, phone, phone_verified_at, store_category_id, store_topic_id, region, city, address_line1, address_line2, formatted_address, lat, lng, place_id, approval_status, is_visible, first_listed_at, rejected_reason, revision_note, suspended_reason, created_at, approved_at, store_categories ( slug, name ), store_topics ( slug, name )";

/** 사장님 — 내 매장 신청 내용·진행 단계 시각 (진행 막대·보완 제출 폼 공용). */
export async function GET(_req: Request, context: { params: Promise<{ storeId: string }> }) {
  const userId = await getRouteUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  const { storeId } = await context.params;
  const sid = String(storeId ?? "").trim();
  if (!sid) return NextResponse.json({ ok: false, error: "missing_store_id" }, { status: 400 });

  const { data: store, error } = await sb.from("stores").select(APPLICATION_SELECT).eq("id", sid).maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: "store_read_failed" }, { status: 500 });
  if (!store || String((store as { owner_user_id?: unknown }).owner_user_id ?? "") !== userId) {
    return NextResponse.json({ ok: false, error: "store_not_found" }, { status: 404 });
  }
  const { data: perm } = await sb
    .from("store_sales_permissions")
    .select("sales_status, approved_at")
    .eq("store_id", sid)
    .maybeSingle();
  const events = await listStoreApplicationEvents(sb, sid);
  if (!events.ok) return NextResponse.json({ ok: false, error: events.error }, { status: 500 });
  return NextResponse.json({
    ok: true,
    store,
    sales: perm
      ? {
          sales_status: (perm as { sales_status?: string | null }).sales_status ?? null,
          approved_at: (perm as { approved_at?: string | null }).approved_at ?? null,
        }
      : null,
    events: events.rows.map((e) => ({
      from_status: e.from_status,
      to_status: e.to_status,
      action: e.action,
      actor_type: e.actor_type,
      created_at: e.created_at,
      reason: OWNER_VISIBLE_REASON_ACTIONS.has(e.action) ? e.reason : null,
    })),
  });
}
