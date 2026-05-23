import { NextResponse } from "next/server";
import { createRequestId, SAMARKET_REQUEST_ID_HEADER } from "@/lib/http/request-id";
import { loadStoreTaxonomyRows } from "@/lib/stores/load-store-taxonomy-rows";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 매장 오너 폼·/stores 홈: 활성 업종 1·2·3차 읽기 전용.
 * 서비스 롤 — 로그인 없이 호출 가능(마스터 데이터만).
 */
export async function GET(request: Request) {
  const headersIn = new Headers(request.headers);
  const requestId = headersIn.get(SAMARKET_REQUEST_ID_HEADER)?.trim() || createRequestId();
  const jsonHeaders = { [SAMARKET_REQUEST_ID_HEADER]: requestId };

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json(
      {
        ok: true,
        categories: [],
        topics: [],
        subtopics: [],
        meta: {
          source: "supabase_unconfigured" as const,
          store_topics_table: "unknown" as const,
          store_subtopics_table: "unknown" as const,
          category_count: 0,
          topic_count: 0,
          subtopic_count: 0,
        },
      },
      { headers: jsonHeaders }
    );
  }

  try {
    const loaded = await loadStoreTaxonomyRows(sb, { activeOnly: true });
    return NextResponse.json(
      {
        ok: true,
        categories: loaded.categories,
        topics: loaded.topics,
        subtopics: loaded.subtopics,
        meta: {
          source: "supabase" as const,
          store_topics_table: "ok" as const,
          store_subtopics_table: loaded.subtopicsTableMissing ? ("missing" as const) : ("ok" as const),
          category_count: loaded.categories.length,
          topic_count: loaded.topics.length,
          subtopic_count: loaded.subtopics.length,
        },
      },
      { headers: jsonHeaders }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown";
    const missingTopics = /store_topics|42P01/i.test(message);
    console.error("[GET /api/stores/taxonomy]", e);
    if (missingTopics) {
      return NextResponse.json(
        {
          ok: true,
          categories: [],
          topics: [],
          subtopics: [],
          meta: {
            source: "supabase" as const,
            store_topics_table: "missing" as const,
            store_subtopics_table: "unknown" as const,
            category_count: 0,
            topic_count: 0,
            subtopic_count: 0,
          },
        },
        { headers: jsonHeaders }
      );
    }
    return NextResponse.json(
      { ok: false, error: message, categories: [], topics: [], subtopics: [] },
      { status: 500, headers: jsonHeaders }
    );
  }
}
