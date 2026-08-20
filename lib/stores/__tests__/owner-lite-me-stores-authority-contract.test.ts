import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StoreRow } from "@/lib/stores/db-store-mapper";

function makeStore(partial: Partial<StoreRow> & Pick<StoreRow, "id">): StoreRow {
  return {
    id: partial.id,
    slug: partial.slug ?? `slug-${partial.id}`,
    store_name: partial.store_name ?? `Store ${partial.id}`,
    approval_status: partial.approval_status ?? "approved",
    is_visible: partial.is_visible ?? true,
    is_open: partial.is_open ?? true,
  } as StoreRow;
}

describe("owner-lite projection + me-stores authority", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("seedOwnerLiteStoreFromStores projects without inventing network", async () => {
    const { seedOwnerLiteStoreFromStores, getOwnerLiteStoreSnapshot, clearOwnerLiteStore } =
      await import("@/lib/stores/owner-lite-external-store");
    const stores = [makeStore({ id: "s1", store_name: "Alpha" })];
    seedOwnerLiteStoreFromStores(stores);
    const snap = getOwnerLiteStoreSnapshot();
    expect(snap.loading).toBe(false);
    expect(snap.ownerStores).toHaveLength(1);
    expect(snap.ownerStore?.id).toBe("s1");

    clearOwnerLiteStore();
    const cleared = getOwnerLiteStoreSnapshot();
    expect(cleared.ownerStores).toEqual([]);
    expect(cleared.ownerStore).toBeNull();
    expect(cleared.loading).toBe(false);
  });

  it("projects OwnerLite from me-stores TTL peek without fetch", async () => {
    const { seedMeStoresListClientCacheFromStores, invalidateMeStoresListDedupedCache } =
      await import("@/lib/me/fetch-me-stores-deduped");
    invalidateMeStoresListDedupedCache();
    const stores = [makeStore({ id: "s2", store_name: "Beta" })];
    seedMeStoresListClientCacheFromStores(stores);

    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { seedOwnerLiteStoreFromStores, getOwnerLiteStoreSnapshot, clearOwnerLiteStore } =
      await import("@/lib/stores/owner-lite-external-store");
    const { parseStoreRowsFromMeStoresJson, peekMeStoresListClientCache } = await import(
      "@/lib/me/fetch-me-stores-deduped"
    );
    const peek = peekMeStoresListClientCache();
    expect(peek).not.toBeNull();
    const rows = parseStoreRowsFromMeStoresJson(peek!.json);
    expect(rows?.[0]?.id).toBe("s2");
    seedOwnerLiteStoreFromStores(rows!);
    expect(getOwnerLiteStoreSnapshot().ownerStore?.id).toBe("s2");
    expect(fetchSpy).not.toHaveBeenCalled();
    clearOwnerLiteStore();
    fetchSpy.mockRestore();
  });
});

describe("warm-main-shell-data contract (source)", () => {
  it("keeps full me-stores TTL warm authority and projects OwnerLite from same rows", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(path.join(process.cwd(), "lib/app/warm-main-shell-data.ts"), "utf8");
    expect(src).toContain("do NOT skip me-stores network solely because OwnerLite");
    expect(src).toContain("peekMeStoresListClientCache");
    expect(src).toContain("seedOwnerLiteStoreFromStores");
    expect(src).toContain("fetchMeStoresListDeduped");
    expect(src).not.toContain("isOwnerLiteSnapshotFresh");
  });
});

describe("OwnerHubMeStoresCacheSeed contract (source)", () => {
  it("seeds me-stores TTL and OwnerLite from the same RSC rows", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(
      path.join(process.cwd(), "components/business/owner/OwnerHubMeStoresCacheSeed.tsx"),
      "utf8"
    );
    expect(src).toContain("seedMeStoresListClientCacheFromStores");
    expect(src).toContain("seedOwnerLiteStoreFromStores");
  });
});

describe("me-stores client network authority (source)", () => {
  it("approved-stores map and promotion targets use fetchMeStoresListDeduped", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const mapSrc = fs.readFileSync(
      path.join(process.cwd(), "lib/addresses/fetch-approved-stores-map.ts"),
      "utf8"
    );
    const promoSrc = fs.readFileSync(
      path.join(process.cwd(), "hooks/usePromotionOrderTargets.ts"),
      "utf8"
    );
    const applySrc = fs.readFileSync(
      path.join(process.cwd(), "app/(main)/stores/owner/apply/page.tsx"),
      "utf8"
    );
    expect(mapSrc).toContain("fetchMeStoresListDeduped");
    expect(mapSrc).not.toMatch(/fetch\(["'`]\/api\/me\/stores["'`]/);
    expect(promoSrc).toContain("fetchMeStoresListDeduped");
    expect(promoSrc).not.toMatch(/fetch\(["'`]\/api\/me\/stores["'`]/);
    expect(applySrc).toContain("fetchMeStoresListDeduped");
    expect(applySrc).toContain("parseStoreRowsFromMeStoresJson");
    // POST create may still call /api/me/stores; list read must use deduped.
    expect(applySrc).toMatch(/method:\s*["']POST["']/);
    expect(applySrc).toMatch(/fetchMeStoresListDeduped\(\)/);
  });

  it("store PATCH/POST invalidate server me-stores Map", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const patchSrc = fs.readFileSync(
      path.join(process.cwd(), "app/api/me/stores/[storeId]/route.ts"),
      "utf8"
    );
    const postSrc = fs.readFileSync(path.join(process.cwd(), "app/api/me/stores/route.ts"), "utf8");
    const loadSrc = fs.readFileSync(
      path.join(process.cwd(), "lib/me/load-me-stores-for-user.ts"),
      "utf8"
    );
    expect(loadSrc).toContain("export function invalidateMeStoresListServerCache");
    expect(patchSrc).toContain("invalidateMeStoresListServerCache");
    expect(postSrc).toContain("invalidateMeStoresListServerCache");
  });

  it("owner profile/basic-info/settings invalidate client TTL after mutation", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    for (const rel of [
      "app/(main)/stores/owner/profile/page.tsx",
      "app/(main)/stores/owner/basic-info/page.tsx",
      "app/(main)/stores/owner/settings/page.tsx",
    ]) {
      const src = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
      expect(src).toContain("invalidateMeStoresListDedupedCache");
      expect(src).toContain("refreshOwnerLiteStore");
    }
  });
});
