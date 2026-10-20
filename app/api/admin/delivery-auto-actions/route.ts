import { NextResponse } from "next/server";

import { requireAdminApiUser } from "@/lib/admin/require-admin-api";

import { getSupabaseServer } from "@/lib/chat/supabase-server";

import { manilaTodayRangeUtc } from "@/lib/admin/metrics/manila-period";

import { isAdminListUuid } from "@/lib/admin/pagination/parse-admin-list-page";

import { parseDeliveryListPage } from "@/lib/admin/delivery-list/delivery-list-page";



export const runtime = "nodejs";

export const dynamic = "force-dynamic";



function isMissingFunction(msg: string): boolean {

  return /does not exist|function .* not found|Could not find the function|schema cache/i.test(msg);

}



function enrichRpcActions(rows: unknown[]): Record<string, unknown>[] {

  const list = Array.isArray(rows) ? rows : [];

  return list.map((raw) => {

    const a = raw as Record<string, unknown>;

    const oid = a.order_id ? String(a.order_id) : "";

    const orderNo = String(a.order_no ?? "");

    return {

      ...a,

      order_no: orderNo,

      admin_order_url: oid ? `/admin/stores/orders/${encodeURIComponent(oid)}` : "",

      admin_alerts_query: a.event_id ? `/admin/delivery-alerts` : "",

    };

  });

}



/**

 * GET — 자동 조치 목록 (R7 서버 페이지네이션).

 * - 목록: `admin_delivery_auto_actions_page` — 필터·정렬(executed_at desc, id desc)·limit/offset·정확한 total 을 DB 에서.

 * - KPI·배너·규칙 집계: 기존 `admin_delivery_auto_actions_dashboard` (없으면 dashboard=null, 목록은 그대로).

 * - 「오늘만」: 필리핀(Asia/Manila) 오늘 경계를 DB 필터로 넘긴다 (메모리 필터 없음).

 */

export async function GET(req: Request) {

  const admin = await requireAdminApiUser();

  if (!admin.ok) return admin.response;



  let sb: ReturnType<typeof getSupabaseServer>;

  try {

    sb = getSupabaseServer();

  } catch {

    return NextResponse.json({ error: "server_config" }, { status: 500 });

  }



  const sp = new URL(req.url).searchParams;

  const page = parseDeliveryListPage(sp);



  const statusRaw = sp.get("status")?.trim() ?? "";

  const p_status = !statusRaw || statusRaw === "all" ? null : statusRaw;



  const ruleRaw = sp.get("rule_id")?.trim() ?? "";

  const p_rule_id = ruleRaw && isAdminListUuid(ruleRaw) ? ruleRaw : null;



  const flag = (k: string) => sp.get(k) === "1" || sp.get(k)?.toLowerCase() === "true";

  const p_dangerous_only = flag("dangerous_only");

  const p_retry_only = flag("retry_only");

  const p_today_only = flag("today_only");

  const today = p_today_only ? manilaTodayRangeUtc() : null;



  const sbAny = sb as any;



  const [listRes, dashRes] = await Promise.all([

    sbAny.rpc("admin_delivery_auto_actions_page", {

      p_status,

      p_rule_id,

      p_dangerous_only,

      p_retry_only,

      p_from: today?.fromIso ?? null,

      p_to: today?.toIso ?? null,

      p_limit: page.limit,

      p_offset: page.offset,

    }),

    // KPI·배너·규칙 집계만 쓴다 — 이 RPC 의 actions 는 목록에 쓰지 않는다 (최소 limit).

    sbAny.rpc("admin_delivery_auto_actions_dashboard", {

      p_status: null,

      p_rule_id: null,

      p_dangerous_only: false,

      p_retry_only: false,

      p_today_only: false,

      p_limit: 10,

    }),

  ]);



  if (listRes.error) {

    const msg = String(listRes.error.message ?? "");

    if (isMissingFunction(msg)) {

      return NextResponse.json(

        { error: "rpc_missing", hint: "Apply migration 20270601130000_r7_delivery_auto_actions_page" },

        { status: 503 }

      );

    }

    console.error("[admin delivery-auto-actions GET]", msg.slice(0, 240));

    return NextResponse.json({ error: "load_failed" }, { status: 500 });

  }



  if (dashRes.error && !isMissingFunction(String(dashRes.error.message ?? ""))) {

    console.error("[admin delivery-auto-actions GET dashboard]", String(dashRes.error.message ?? "").slice(0, 240));

  }



  const list = listRes.data && typeof listRes.data === "object" ? (listRes.data as Record<string, unknown>) : {};

  const actions = enrichRpcActions(Array.isArray(list.rows) ? (list.rows as unknown[]) : []);

  const totalNum = Number(list.total);

  const total = Number.isFinite(totalNum) && totalNum >= 0 ? totalNum : actions.length;



  const dashboard =

    !dashRes.error && dashRes.data && typeof dashRes.data === "object"

      ? { ...(dashRes.data as Record<string, unknown>), actions }

      : null;



  return NextResponse.json({

    actions,

    total,

    limit: page.limit,

    offset: page.offset,

    dashboard,

    query: {

      limit: page.limit,

      offset: page.offset,

      status: p_status ?? "all",

      rule_id: p_rule_id,

      dangerous_only: p_dangerous_only,

      retry_only: p_retry_only,

      today_only: p_today_only,

    },

    viewer: admin.userId,

  });

}
