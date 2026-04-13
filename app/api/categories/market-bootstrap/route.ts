/**
 * 마켓 거래 탭: 카테고리 단건 + 하위 주제를 **한 번의 HTTP**로 내려
 * 브라우저→Supabase 왕복(직접) 2회를 1회(Vercel→Supabase)로 줄임.
 * `includePosts=1` 이면 첫 페이지 글은 `fetchTradeFeedPage` — `docs/trade-market-feed-contract.md`.
 */
import { NextRequest } from "next/server";
import { jsonError, jsonOk } from "@/lib/http/api-route";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/supabase-server-route";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { loadMarketBootstrapPayload } from "@/lib/market/load-market-bootstrap-payload";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) {
    return jsonError("q 파라미터가 필요합니다.", 400);
  }

  const cookieSb = await createSupabaseRouteHandlerClient();
  const svcSb = tryCreateSupabaseServiceClient();
  const supabase = svcSb ?? cookieSb;
  if (!supabase) {
    return jsonError("데이터베이스 설정이 없습니다.", 503);
  }

  const includePosts = req.nextUrl.searchParams.get("includePosts") === "1";
  const topicParam = req.nextUrl.searchParams.get("topic") ?? "";
  const jkParam = req.nextUrl.searchParams.get("jk");

  const result = await loadMarketBootstrapPayload(supabase, {
    q,
    topic: topicParam,
    jkParam,
    includePosts,
  });

  if (!result.ok) {
    return jsonError(result.message, result.httpStatus);
  }

  const { category, children, childrenForFilter, initialFeed } = result.data;
  return jsonOk({
    category,
    children,
    childrenForFilter,
    ...(initialFeed ? { initialFeed } : {}),
  });
}
