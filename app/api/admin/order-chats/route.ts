import { NextResponse } from "next/server";
import { requireAnyAdminPermission } from "@/lib/admin/chat-admin/chat-admin-guards";
import { listAdminStoreOrderChats } from "@/lib/admin-delivery-orders/list-admin-store-order-chats";
import { parseDeliveryListPage } from "@/lib/admin/delivery-list/delivery-list-page";
import { normalizeAdminListSearch } from "@/lib/admin/list-query/admin-list-query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET — 주문 채팅 목록 (lookup-only, no ensure) · R7 서버 페이지네이션.
 * 쿼리: `limit`(≤100, 기본 20) · `offset` · `q`(주문번호·주문 ID·매장명·고객 닉네임/아이디·회원 ID).
 * 응답: `{ ok, domain: "store_order", rows, total, limit, offset }` — rows 모양은 이전과 같다.
 */
export async function GET(req: Request) {
  const admin = await requireAnyAdminPermission(["chats", "business"]);
  if (!admin.ok) return admin.response;

  const sp = new URL(req.url).searchParams;
  const page = parseDeliveryListPage(sp);
  const q = normalizeAdminListSearch(sp.get("q"));

  try {
    const out = await listAdminStoreOrderChats({ limit: page.limit, offset: page.offset, q });
    return NextResponse.json({
      ok: true,
      domain: "store_order",
      rows: out.rows,
      total: out.total,
      limit: out.limit,
      offset: out.offset,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[admin/order-chats]", msg);
    if (/function .* does not exist|Could not find the function/i.test(msg)) {
      return NextResponse.json(
        { ok: false, error: "rpc_missing", hint: "Apply migration 20270601133000_r7_store_order_chats_page" },
        { status: 503 }
      );
    }
    return NextResponse.json({ ok: false, error: "load_failed" }, { status: 500 });
  }
}
