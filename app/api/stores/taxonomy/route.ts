import { NextResponse } from "next/server";
import { createRequestId, SAMARKET_REQUEST_ID_HEADER } from "@/lib/http/request-id";
import { loadStoreTaxonomyRows } from "@/lib/stores/load-store-taxonomy-rows";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import {
  listBrowseScopePolicyRows,
  mapBrowseScopeDbRow,
} from "@/lib/stores/product/stores-browse-scope-policy-db";
import {
  buildBrowsePrimaryScopeKey,
  buildBrowseSubScopeKey,
  resolveBrowseScopePolicy,
} from "@/lib/stores/product/stores-browse-scope-policy-catalog";
import { isBrowseScopeCustomerVisible } from "@/lib/stores/product/stores-browse-scope-customer-meta";
import {
  buildStoresTaxonomyCustomerBrowseMeta,
  type StoresTaxonomyCustomerBrowseMeta,
} from "@/lib/stores/store-taxonomy-customer-browse";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StoreTaxonomyCategory, StoreTaxonomyTopic } from "@/lib/stores/store-taxonomy-types";

/** 업종 노출 정책 → 고객 탭·칩 메타. 정책 조회 실패는 taxonomy 응답을 막지 않는다(메타 생략 = 전부 노출) */
async function loadCustomerBrowseMeta(
  sb: SupabaseClient,
  categories: readonly StoreTaxonomyCategory[],
  topics: readonly StoreTaxonomyTopic[]
): Promise<StoresTaxonomyCustomerBrowseMeta | null> {
  try {
    const mapped = (await listBrowseScopePolicyRows(sb)).map(mapBrowseScopeDbRow);
    const byScope = new Map(mapped.map((r) => [r.scopeKey, r]));
    const nowMs = Date.now();
    const resolve = (primarySlug: string, subSlug: string | null) => {
      const resolved = resolveBrowseScopePolicy({
        primarySlug,
        subSlug,
        primaryRow: byScope.get(buildBrowsePrimaryScopeKey(primarySlug)) ?? null,
        subRow: subSlug ? byScope.get(buildBrowseSubScopeKey(primarySlug, subSlug)) ?? null : null,
      });
      return {
        visible: isBrowseScopeCustomerVisible(resolved, nowMs),
        displayTitleKo: resolved.displayTitleKo,
        displayTitleEn: resolved.displayTitleEn,
      };
    };
    return buildStoresTaxonomyCustomerBrowseMeta({
      categories,
      topics,
      resolvePrimary: (primarySlug) => resolve(primarySlug, null),
      resolveSub: (primarySlug, subSlug) => resolve(primarySlug, subSlug),
    });
  } catch (e) {
    console.error("[GET /api/stores/taxonomy] customerBrowse", e);
    return null;
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
    const loaded = await loadStoreTaxonomyRows(sb, { activeOnly: true });
    const customerBrowse = await loadCustomerBrowseMeta(sb, loaded.categories, loaded.topics);
    return NextResponse.json(
      {
        ok: true,
        categories: loaded.categories,
        topics: loaded.topics,
        subtopics: loaded.subtopics,
        ...(customerBrowse ? { customerBrowse } : {}),
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
