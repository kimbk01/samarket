import { beforeEach, describe, expect, it } from "vitest";
import {
  requestStoreCartBulkClearReplace,
  resolveStoreCartBulkClearConfirmed,
  useStoreCartConflictUIStore,
} from "@/lib/stores/store-cart-conflict-ui-store";

describe("store-cart-conflict-ui-store bulk", () => {
  const existing = {
    storeId: "store-a",
    storeSlug: "store-a",
    storeName: "A매장",
    itemCount: 2,
    subtotalPhp: 500,
  };
  const target = {
    storeId: "store-b",
    storeSlug: "store-b",
    storeName: "B매장",
  };

  beforeEach(() => {
    useStoreCartConflictUIStore.setState({
      open: false,
      mode: null,
      pendingLine: null,
      existing: null,
      target: null,
      onResolved: null,
      bulkClearResolve: null,
    });
  });

  it("cancels bulk clear on closeConflict", async () => {
    const p = requestStoreCartBulkClearReplace(existing, target);
    useStoreCartConflictUIStore.getState().closeConflict();
    await expect(p).resolves.toBe(false);
  });

  it("resolves bulk clear after confirm", async () => {
    const p = requestStoreCartBulkClearReplace(existing, target);
    const s = useStoreCartConflictUIStore.getState();
    expect(s.mode).toBe("bulk_clear");
    expect(s.existing?.storeName).toBe("A매장");
    expect(s.target?.storeName).toBe("B매장");
    resolveStoreCartBulkClearConfirmed();
    await expect(p).resolves.toBe(true);
    expect(useStoreCartConflictUIStore.getState().open).toBe(false);
  });
});
