import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { parseDeliveryListPage } from "@/lib/admin/delivery-list/delivery-list-page";
import { normalizeAdminListSearch } from "@/lib/admin/list-query/admin-list-query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RIDER_VIEWS = ["riders", "queue", "assignable"] as const;
type RiderView = (typeof RIDER_VIEWS)[number];

function isMissingFunction(msg: string): boolean {
  return /function .* does not exist|Could not find the function/i.test(msg);
}

/**
 * GET
 * - `view`(riders|queue|assignable) 또는 `limit`/`offset` 이 있으면 (R7 서버 페이지네이션):
 *   `admin_delivery_riders_page` — 탭별 limit/offset + 정확한 total, 라이더·미배정 전체 건수, 정지·주의 수.
 *   응답 `{ view, rows, total, limit, offset, riders_total, unassigned_total, suspended_count, flagged_count, generated_at }`.
 * - 파라미터가 없으면 기존 스냅샷 응답 그대로 (`{ riders, unassigned_deliveries, generated_at }` — 이전 호출자 호환).
 */
export async function GET(req: Request) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });

  const sbAny = sb as any;
  const sp = new URL(req.url).searchParams;
  const paged = sp.has("view") || sp.has("limit") || sp.has("offset");

  if (paged) {
    const viewRaw = (sp.get("view") ?? "").trim();
    const view: RiderView = (RIDER_VIEWS as readonly string[]).includes(viewRaw) ? (viewRaw as RiderView) : "riders";
    const page = parseDeliveryListPage(sp);
    const q = normalizeAdminListSearch(sp.get("q"));
    const { data, error } = await sbAny.rpc("admin_delivery_riders_page", {
      p_view: view,
      p_q: q || null,
      p_limit: page.limit,
      p_offset: page.offset,
    });
    if (error) {
      const msg = String(error.message ?? "");
      if (isMissingFunction(msg)) {
        return NextResponse.json(
          { error: "rpc_missing", hint: "Apply migration 20270601131000_r7_delivery_riders_page" },
          { status: 503 }
        );
      }
      console.error("[admin delivery-riders GET page]", msg.slice(0, 240));
      return NextResponse.json({ error: "load_failed" }, { status: 500 });
    }
    const d = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
    const rows = Array.isArray(d.rows) ? d.rows : [];
    const num = (v: unknown, fb: number) => {
      const n = Number(v);
      return Number.isFinite(n) && n >= 0 ? n : fb;
    };
    return NextResponse.json({
      view,
      rows,
      total: num(d.total, rows.length),
      limit: page.limit,
      offset: page.offset,
      riders_total: num(d.riders_total, 0),
      unassigned_total: num(d.unassigned_total, 0),
      suspended_count: num(d.suspended_count, 0),
      flagged_count: num(d.flagged_count, 0),
      generated_at: typeof d.generated_at === "string" ? d.generated_at : null,
    });
  }

  const { data, error } = await sbAny.rpc("admin_delivery_riders_operations_snapshot");
  if (error) {
    const msg = String(error.message ?? "");
    if (isMissingFunction(msg)) {
      return NextResponse.json(
        { error: "rpc_missing", hint: "Apply migration 20260517120000_delivery_riders_admin_center" },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: msg.slice(0, 240) }, { status: 500 });
  }

  return NextResponse.json(data ?? { riders: [], unassigned_deliveries: [] });
}
