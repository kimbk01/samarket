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
