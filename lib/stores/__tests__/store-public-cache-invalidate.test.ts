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
});
