import { type SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { resolvePostsReadClients } from "@/lib/supabase/resolve-posts-read-clients";
import { expandTradeCategoryIdsForRoot } from "@/lib/trade/trade-market-catalog";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET — 거래 루트 id 하나에 대해 마켓 피드와 동일한 `trade_category_id` id 목록 (루트+하위).
 * 관리자 상품 필터 등 클라이언트가 합집합을 맞출 때 사용.
 */
export async function GET(req: NextRequest) {
  const clients = resolvePostsReadClients(req);
  if (!clients) {
    return NextResponse.json({ ok: false, ids: [] }, { status: 503 });
  }
  const rootId = req.nextUrl.searchParams.get("rootId")?.trim() ?? "";
  if (!UUID_RE.test(rootId)) {
    return NextResponse.json({ ok: false, error: "rootId_invalid" }, { status: 400 });
  }
  const ids = await expandTradeCategoryIdsForRoot(
    clients.readSb as SupabaseClient<any>,
    clients.serviceSb as SupabaseClient<any> | null,
    rootId
  );
  return NextResponse.json(
    { ok: true, ids },
    { headers: { "Cache-Control": "private, max-age=60", Vary: "Cookie" } }
  );
}
