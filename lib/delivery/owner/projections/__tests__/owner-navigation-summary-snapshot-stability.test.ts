import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regression guard for P0 initial-load blocker (React #185).
 *
 * getOwnerNavigationSummarySnapshot() feeds useSyncExternalStore. If it returns a
 * freshly-created object per call for unchanged owner-lite input, useSyncExternalStore
 * treats every read as a change and loops forever, tripping the Root Error Boundary on
 * the global BottomNav path (blocks / and /community-messenger). Same (loading, ownerStore)
 * input MUST yield the same OwnerNavigationSummary reference.
 */

type StoreLike = { id?: string | null; slug?: string | null; store_name?: string | null };
type MockOwnerLiteSnapshot = {
  loading: boolean;
  ownerStore: StoreLike | null;
  ownerStores: StoreLike[];
};

let mockSnapshot: MockOwnerLiteSnapshot = { loading: true, ownerStore: null, ownerStores: [] };

vi.mock("@/lib/stores/owner-lite-external-store", () => ({
  getOwnerLiteStoreSnapshot: () => mockSnapshot,
  getOwnerLiteStoreServerSnapshot: () => ({ loading: true, ownerStore: null, ownerStores: [] }),
  subscribeOwnerLiteStore: () => () => {},
}));

async function loadSnapshotGetter() {
  const mod = await import(
    "@/lib/delivery/owner/projections/use-owner-navigation-summary"
  );
  return mod.getOwnerNavigationSummarySnapshot;
}

describe("getOwnerNavigationSummarySnapshot referential stability", () => {
  beforeEach(() => {
    vi.resetModules();
    mockSnapshot = { loading: true, ownerStore: null, ownerStores: [] };
  });

  it("returns the same reference when owner-lite input is unchanged", async () => {
    const store: StoreLike = { id: "s1", slug: "demo", store_name: "Demo" };
    mockSnapshot = { loading: false, ownerStore: store, ownerStores: [store] };
    const getSnapshot = await loadSnapshotGetter();

    expect(getSnapshot()).toBe(getSnapshot());
  });

  it("keeps the same reference when only unrelated owner-lite fields change", async () => {
    const store: StoreLike = { id: "s1", slug: "demo", store_name: "Demo" };
    mockSnapshot = { loading: false, ownerStore: store, ownerStores: [store] };
    const getSnapshot = await loadSnapshotGetter();
    const first = getSnapshot();

    // ownerStores array grows, but loading + ownerStore reference are identical.
    mockSnapshot = {
      loading: false,
      ownerStore: store,
      ownerStores: [store, { id: "s2", slug: "other", store_name: "Other" }],
    };
    expect(getSnapshot()).toBe(first);
  });

  it("emits a new reference exactly once when loading changes", async () => {
    const store: StoreLike = { id: "s1", slug: "demo", store_name: "Demo" };
    mockSnapshot = { loading: true, ownerStore: store, ownerStores: [store] };
    const getSnapshot = await loadSnapshotGetter();
    const loadingSummary = getSnapshot();

    mockSnapshot = { loading: false, ownerStore: store, ownerStores: [store] };
    const settled = getSnapshot();

    expect(settled).not.toBe(loadingSummary);
    expect(settled.loading).toBe(false);
    // Stable again after the transition.
    expect(getSnapshot()).toBe(settled);
  });

  it("emits a new reference exactly once when ownerStore changes", async () => {
    const storeA: StoreLike = { id: "s1", slug: "a", store_name: "A" };
    mockSnapshot = { loading: false, ownerStore: storeA, ownerStores: [storeA] };
    const getSnapshot = await loadSnapshotGetter();
    const summaryA = getSnapshot();
    expect(summaryA.storeId).toBe("s1");

    const storeB: StoreLike = { id: "s2", slug: "b", store_name: "B" };
    mockSnapshot = { loading: false, ownerStore: storeB, ownerStores: [storeB] };
    const summaryB = getSnapshot();

    expect(summaryB).not.toBe(summaryA);
    expect(summaryB.storeId).toBe("s2");
    expect(getSnapshot()).toBe(summaryB);
  });

  it("stays referentially stable across repeated reads after a subscribe emit", async () => {
    const store: StoreLike = { id: "s1", slug: "demo", store_name: "Demo" };
    mockSnapshot = { loading: false, ownerStore: store, ownerStores: [store] };
    const getSnapshot = await loadSnapshotGetter();

    const reads = [getSnapshot(), getSnapshot(), getSnapshot(), getSnapshot()];
    for (const read of reads) {
      expect(read).toBe(reads[0]);
    }
  });
});
