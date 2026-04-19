import { NextResponse } from "next/server";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import type { StoreTaxonomyCategory, StoreTaxonomyTopic } from "@/lib/stores/store-taxonomy-types";
import { createRequestId, SAMARKET_REQUEST_ID_HEADER } from "@/lib/http/request-id";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 매장 오너 폼용: 활성 업종(store_categories) + 세부 주제(store_topics) 읽기 전용.
 * 서비스 롤 — 로그인 없이 호출 가능(마스터 데이터만).
 */
export async function GET(request: Request) {
  const headersIn = new Headers(request.headers);
  const requestId = headersIn.get(SAMARKET_REQUEST_ID_HEADER)?.trim() || createRequestId();
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({
      ok: true,
      categories: [] as StoreTaxonomyCategory[],
      topics: [] as StoreTaxonomyTopic[],
      meta: {
        source: "supabase_unconfigured" as const,
        store_topics_table: "unknown" as const,
        category_count: 0,
        topic_count: 0,
      },
    }, { headers: { [SAMARKET_REQUEST_ID_HEADER]: requestId } });
  }

  try {
    const { data: categories, error: cErr } = await sb
      .from("store_categories")
      .select("id, name, slug, sort_order")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (cErr) {
      console.error("[GET /api/stores/taxonomy] categories", cErr);
      return NextResponse.json(
        { ok: false, error: cErr.message, categories: [], topics: [] },
        { status: 500 }
      );
    }

    const catList = (categories ?? []) as StoreTaxonomyCategory[];

    const { data: topics, error: tErr } = await sb
      .from("store_topics")
      .select("id, store_category_id, name, slug, sort_order")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (tErr) {
      const msg = String(tErr.message ?? "");
      const missing = msg.includes("store_topics") || (tErr as { code?: string }).code === "42P01";
      if (missing) {
        return NextResponse.json({
          ok: true,
          categories: catList,
          topics: [] as StoreTaxonomyTopic[],
          meta: {
            source: "supabase" as const,
            store_topics_table: "missing" as const,
            category_count: catList.length,
            topic_count: 0,
          },
        }, { headers: { [SAMARKET_REQUEST_ID_HEADER]: requestId } });
      }
      console.error("[GET /api/stores/taxonomy] topics", tErr);
      return NextResponse.json(
        { ok: false, error: tErr.message, categories: catList, topics: [] },
        { status: 500, headers: { [SAMARKET_REQUEST_ID_HEADER]: requestId } }
      );
    }

    const topicList = (topics ?? []) as StoreTaxonomyTopic[];

    return NextResponse.json({
      ok: true,
      categories: catList,
      topics: topicList,
      meta: {
        source: "supabase" as const,
        store_topics_table: "ok" as const,
        category_count: catList.length,
        topic_count: topicList.length,
      },
    }, { headers: { [SAMARKET_REQUEST_ID_HEADER]: requestId } });
  } catch (e) {
    console.error("[GET /api/stores/taxonomy]", e);
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : "unknown",
        categories: [],
        topics: [],
      },
      { status: 500, headers: { [SAMARKET_REQUEST_ID_HEADER]: requestId } }
    );
  }
}
