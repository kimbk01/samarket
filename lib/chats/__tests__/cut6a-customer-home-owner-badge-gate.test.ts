import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("CUT6A customer Delivery HOME owner-hub-badge gate", () => {
  it("Stores root header only subscribes when preferred owner store exists", () => {
    const src = readFileSync(
      resolve(process.cwd(), "components/stores/StoresRootTier1HeaderActions.tsx"),
      "utf8"
    );
    expect(src).toContain("useOwnerHeaderOpsAttentionCountWhenEnabled");
    expect(src).toContain("ownerNav.hasPreferredStore");
    expect(src).not.toMatch(/useOwnerHeaderOpsAttentionCount\(\)/);
  });

  it("FAB sector only subscribes when approved owner store is present", () => {
    const src = readFileSync(
      resolve(process.cwd(), "components/layout/MainBottomNavFabSector.tsx"),
      "utf8"
    );
    expect(src).toContain("useOwnerFabOrdersBadgeCountWhenEnabled");
    expect(src).toContain("useOwnerFabStoreBadgeCountWhenEnabled");
    expect(src).toContain("useOwnerFabOrderChatBadgeCountWhenEnabled");
    expect(src).toContain("ownerFabEnabled");
    expect(src).not.toMatch(/useOwnerFabOrdersBadgeCount\(\)/);
  });

  it("OwnerHubBadgeRuntime path prefixes exclude customer /stores HOME", () => {
    const src = readFileSync(resolve(process.cwd(), "lib/chats/owner-hub-badge-store.ts"), "utf8");
    const start = src.indexOf("const PATH_FETCH_PREFIXES");
    const end = src.indexOf("] as const", start);
    const block = src.slice(start, end);
    expect(block).not.toMatch(/"\/stores"/);
    expect(block).toContain('"/stores/owner/orders"');
  });
});
