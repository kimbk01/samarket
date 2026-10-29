import { NextResponse } from "next/server";
import { createRequestId, SAMARKET_REQUEST_ID_HEADER } from "@/lib/http/request-id";
import { loadStoreTaxonomyRows } from "@/lib/stores/load-store-taxonomy-rows";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { loadBrowseScopeCustomerTaxonomyPolicy } from "@/lib/stores/product/stores-browse-scope-customer-meta";
import { STORE_PUBLIC_API_ERROR_CODES } from "@/lib/stores/store-public-api-error-codes";
import { syncStorePublicReadCachesWithSharedGeneration } from "@/lib/stores/store-public-shared-cache-generation";
import { loadStoreTaxonomyPublicWithCache } from "@/lib/stores/store-taxonomy-public-server-cache";

/** 정책 조회 실패 본문 — 응답에는 쓰고 캐시에는 저장하지 않기 위한 표식 */
class TaxonomyUncacheableBody extends Error {
  constructor(readonly body: unknown) {
    super("taxonomy_uncacheable_body");
  }
}

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
    /** v4 PERF-15 — 인스턴스 메모리 캐시 (세대 동기화 후 조회, 미스 시 single-flight 1회) */
    await syncStorePublicReadCachesWithSharedGeneration();
    const body = await loadStoreTaxonomyPublicWithCache(async () => {
      const loaded = await loadStoreTaxonomyRows(sb, { activeOnly: true });
      /** P-01·P-02 — 업종 노출 정책(숨김·표시명)을 고객 탭·칩·헤더용으로 부가 (오너 폼은 무시, 원본 목록 불변). 정책 조회 실패 = 부가 없음. */
      let scopePolicyFailed = false;
      const scopePolicy = await loadBrowseScopeCustomerTaxonomyPolicy(sb, loaded.categories, loaded.topics).catch(
        (e: unknown) => {
          console.error("[GET /api/stores/taxonomy] browse scope policy", e);
          scopePolicyFailed = true;
          return { hiddenScopeKeys: [] as string[], displayTitles: {} };
        }
      );
      const out = {
        ok: true as const,
        categories: loaded.categories,
        topics: loaded.topics,
        subtopics: loaded.subtopics,
        browseHiddenScopeKeys: scopePolicy.hiddenScopeKeys,
        browseScopeDisplayTitles: scopePolicy.displayTitles,
        meta: {
          source: "supabase" as const,
          store_topics_table: "ok" as const,
          store_subtopics_table: loaded.subtopicsTableMissing ? ("missing" as const) : ("ok" as const),
          category_count: loaded.categories.length,
          topic_count: loaded.topics.length,
          subtopic_count: loaded.subtopics.length,
        },
      };
      /** 정책 조회 실패 본문은 캐시하지 않고 이번 응답에만 쓴다 (숨김 업종 노출 고착 방지) */
      if (scopePolicyFailed) throw new TaxonomyUncacheableBody(out);
      return out;
    }).catch((e: unknown) => {
      if (e instanceof TaxonomyUncacheableBody) return e.body;
      throw e;
    });
    return NextResponse.json(body, { headers: jsonHeaders });
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
      { ok: false, error: STORE_PUBLIC_API_ERROR_CODES.taxonomy, categories: [], topics: [], subtopics: [] },
      { status: 500, headers: jsonHeaders }
    );
  }
}
