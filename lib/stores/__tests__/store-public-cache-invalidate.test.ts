import { describe, expect, it } from "vitest";
import {
  peekStoreSummaryPublicCache,
  primeStoreSummaryCache,
} from "@/lib/stores/store-delivery-api-client";
import {
  readStoreSummaryPublicServerCache,
  writeStoreSummaryPublicServerCache,
} from "@/lib/stores/store-summary-public-server-cache";
import { invalidateStorePublicCachesForSlugOnServer } from "@/lib/stores/store-public-cache-invalidate-server";
import {
  getApprovedStoreBySlug,
  resetApprovedStoreSlugCacheForTests,
} from "@/lib/stores/get-approved-store-by-slug";

describe("invalidateStorePublicCachesForSlug", () => {
  it("서버·클라 summary 캐시를 slug 기준으로 제거", () => {
    writeStoreSummaryPublicServerCache("Aa11", { ok: true, store: { id: "1" } });
    expect(readStoreSummaryPublicServerCache("aa11")).toEqual({ ok: true, store: { id: "1" } });

    primeStoreSummaryCache("aa11", { status: 200, json: { ok: true, store: { id: "1" } } });
    expect(peekStoreSummaryPublicCache("aa11")).not.toBeNull();

    invalidateStorePublicCachesForSlugOnServer("aa11");

    expect(readStoreSummaryPublicServerCache("aa11")).toBeNull();
    expect(peekStoreSummaryPublicCache("aa11")).toBeNull();
  });

  it("공개 slug 상세 lookup 캐시도 함께 제거", async () => {
    resetApprovedStoreSlugCacheForTests();
    const rows = new Map([["aa11", { id: "1", slug: "aa11", approval_status: "approved", is_visible: true }]]);
    const sb = {
      from: () => ({
        select: () => ({
          eq: (_column: string, slug: string) => ({
            maybeSingle: async () => ({ data: rows.get(slug) ?? null, error: null }),
          }),
        }),
      }),
    };

    const first = await getApprovedStoreBySlug(sb as never, "aa11", "id, slug, approval_status, is_visible");
    expect(first).toEqual({ ok: true, store: rows.get("aa11") });

    rows.set("aa11", { id: "1", slug: "aa11", approval_status: "approved", is_visible: false });
    const cached = await getApprovedStoreBySlug(sb as never, "aa11", "id, slug, approval_status, is_visible");
    expect(cached).toEqual(first);

    invalidateStorePublicCachesForSlugOnServer("aa11");

    const afterInvalidate = await getApprovedStoreBySlug(sb as never, "aa11", "id, slug, approval_status, is_visible");
    expect(afterInvalidate).toEqual({ ok: false, reason: "not_found" });
    resetApprovedStoreSlugCacheForTests();
  });
});
