import { NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import {
  getCachedStoreIfOwner,
  peekOwnerStoreOwnershipCacheHit,
} from "@/lib/stores/owner-store-ownership-cache";
import { jsonPayloadBytes, logOwnerDashboardPerf, perfNowMs } from "@/lib/stores/owner-dashboard-perf";
import {
  getCachedOwnerStoreInquiriesList,
  peekOwnerStoreInquiriesListCacheHit,
} from "@/lib/stores/owner-store-inquiries-list-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROUTE = "/api/me/stores/[storeId]/inquiries";
const INQUIRIES_LIST_LIMIT = 60;

/** 매장 오너: 받은 문의 목록 */
export async function GET(
  _req: Request,
  context: { params: Promise<{ storeId: string }> }
) {
  const wall0 = perfNowMs();
  let auth_ms = 0;
  let ownership_ms = 0;
  let list_ms = 0;
  let cache_hit: 0 | 1 = 0;

  const auth0 = perfNowMs();
  const userId = await getRouteUserId();
  auth_ms = Math.round(perfNowMs() - auth0);

  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { storeId } = await context.params;
  const id = typeof storeId === "string" ? storeId.trim() : "";
  if (!id) {
    return NextResponse.json({ ok: false, error: "missing_store_id" }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const ownershipCachedBefore = peekOwnerStoreOwnershipCacheHit(userId, id);

  const own0 = perfNowMs();
  const gate = await getCachedStoreIfOwner(sb, userId, id);
  ownership_ms = Math.round(perfNowMs() - own0);
  if (!gate.ok) {
    logOwnerDashboardPerf({
      route: ROUTE,
      store_id: id,
      total_ms: Math.round(perfNowMs() - wall0),
      auth_ms,
      ownership_ms,
      ownership_cache_hit: ownershipCachedBefore ? 1 : 0,
    });
    return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  }

  const listCachedBefore = peekOwnerStoreInquiriesListCacheHit(id);
  const list0 = perfNowMs();
  try {
    const { payload: body, cache_hit: listCacheHit } = await getCachedOwnerStoreInquiriesList(
      id,
      async () => {
        const { data: rows, error } = await sb
          .from("store_inquiries")
          .select(
            "id, from_user_id, subject, content, status, answer, answered_at, created_at"
          )
          .eq("store_id", id)
          .order("created_at", { ascending: false })
          .limit(INQUIRIES_LIST_LIMIT);

        if (error) {
          throw error;
        }
        return { ok: true as const, inquiries: rows ?? [] };
      }
    );
    list_ms = Math.round(perfNowMs() - list0);
    cache_hit = listCacheHit ? 1 : 0;
    const total_ms = Math.round(perfNowMs() - wall0);

    logOwnerDashboardPerf({
      route: ROUTE,
      store_id: id,
      total_ms,
      auth_ms,
      ownership_ms,
      db_ms: list_ms,
      list_ms,
      cache_hit,
      ownership_cache_hit: ownershipCachedBefore ? 1 : 0,
      inquiries_list_cache_hit: listCachedBefore ? 1 : 0,
      result_count: body.inquiries.length,
      payload_bytes: jsonPayloadBytes(body),
    });

    return NextResponse.json(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    console.error("[GET store inquiries]", error);
    logOwnerDashboardPerf({
      route: ROUTE,
      store_id: id,
      total_ms: Math.round(perfNowMs() - wall0),
      auth_ms,
      ownership_ms,
      list_ms: Math.round(perfNowMs() - list0),
      db_ms: Math.round(perfNowMs() - list0),
      ownership_cache_hit: ownershipCachedBefore ? 1 : 0,
    });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
