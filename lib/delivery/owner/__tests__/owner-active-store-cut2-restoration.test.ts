/**
 * CUT 2 — Owner active-store resolver restoration contract.
 * Proves MODEL A priority and that Owner authority paths do not use raw stores[0].
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  OWNER_ACTIVE_STORE_SESSION_KEY,
  resolveOwnerActiveStoreId,
  resolveOwnerActiveStoreIdFromOwnedList,
  resolveOwnerActiveStoreRow,
  resolveOwnerActiveStoreRowFromOwnedList,
  writeOwnerActiveStoreIdToSession,
} from "@/lib/delivery/owner/resolve-owner-active-store";
import { pickOwnerStoreFromMeList } from "@/lib/business/pick-owner-store-from-me-list";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

const OWNER_AUTHORITY_PATHS = [
  "lib/business/load-my-business-server.ts",
  "lib/business/build-owner-hub-load-state.ts",
  "lib/business/pick-owner-store-from-me-list.ts",
  "components/business/owner/OwnerHubRuntimeProvider.tsx",
  "components/business/admin/BusinessAdminShell.tsx",
  "components/business/MyBusinessPage.tsx",
  "components/business/owner/OwnerCustomerCareHubView.tsx",
  "components/business/owner/OwnerStoreCouponsView.tsx",
  "components/business/owner/OwnerStoreReviewsView.tsx",
  "components/business/owner/OwnerStoreInquiriesView.tsx",
  "components/business/owner/OwnerStoreNotificationSettingsView.tsx",
  "components/business/owner/OwnerGiftCertificatesView.tsx",
  "components/business/owner/OwnerStoreNoticesView.tsx",
  "components/business/owner/OwnerStoreBannersView.tsx",
  "components/business/owner/OwnerProductNewStoreIdRedirect.tsx",
  "components/business/owner/ads/OwnerDeliveryAdsHubView.tsx",
  "components/mypage/cs/MypageCsOwnerCareBridge.tsx",
  "components/business/StoreBusinessGuard.tsx",
  "app/(main)/stores/owner/layout.tsx",
] as const;

function installSessionStorageMock() {
  const map = new Map<string, string>();
  const sessionStorage = {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => {
      map.set(k, String(v));
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    clear: () => map.clear(),
  };
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    writable: true,
    value: {
      sessionStorage,
      dispatchEvent: () => true,
    },
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    writable: true,
    value: { cookie: "" },
  });
}

function uninstallSessionStorageMock() {
  Reflect.deleteProperty(globalThis, "window");
  Reflect.deleteProperty(globalThis, "document");
}

describe("CUT 2 Owner active-store MODEL A", () => {
  beforeEach(() => {
    installSessionStorageMock();
    writeOwnerActiveStoreIdToSession(null);
  });
  afterEach(() => {
    writeOwnerActiveStoreIdToSession(null);
    uninstallSessionStorageMock();
  });

  it("CASE 1 — single store: always that store", () => {
    const stores = [{ id: "only" }];
    expect(resolveOwnerActiveStoreId({ stores })).toBe("only");
    expect(pickOwnerStoreFromMeList(stores, null, null)?.id).toBe("only");
  });

  it("CASE 2 — multi-store A: route A wins over session B", () => {
    writeOwnerActiveStoreIdToSession("store-b");
    expect(
      resolveOwnerActiveStoreIdFromOwnedList(
        [{ id: "store-a" }, { id: "store-b" }],
        "store-a"
      )
    ).toBe("store-a");
  });

  it("CASE 3 — multi-store B: session B when route empty", () => {
    writeOwnerActiveStoreIdToSession("store-b");
    expect(
      resolveOwnerActiveStoreIdFromOwnedList(
        [{ id: "store-a" }, { id: "store-b" }],
        null
      )
    ).toBe("store-b");
    expect(
      pickOwnerStoreFromMeList([{ id: "store-a" }, { id: "store-b" }], "")?.id
    ).toBe("store-b");
  });

  it("CASE 4 — stale selection not in owned list → canonical fallback (not blind stores[0] outside resolver)", () => {
    writeOwnerActiveStoreIdToSession("ghost");
    const stores = [
      { id: "store-a", approval_status: "approved", is_visible: true },
      { id: "store-b", approval_status: "approved", is_visible: true },
    ];
    const id = resolveOwnerActiveStoreId({
      stores,
      routeStoreId: "missing",
      preferredStoreId: "ghost",
    });
    expect(id).not.toBe("ghost");
    expect(id).not.toBe("missing");
    expect(["store-a", "store-b"]).toContain(id);
  });

  it("CASE 5 — unauthorized route storeId ignored (not in owned list)", () => {
    const stores = [{ id: "mine-a" }, { id: "mine-b" }];
    expect(
      resolveOwnerActiveStoreId({
        stores,
        routeStoreId: "other-owner-store",
        preferredStoreId: "mine-b",
      })
    ).toBe("mine-b");
  });

  it("owned-list helpers match resolveOwnerActiveStoreRow", () => {
    writeOwnerActiveStoreIdToSession("store-b");
    const stores = [{ id: "store-a" }, { id: "store-b" }];
    expect(resolveOwnerActiveStoreRowFromOwnedList(stores, null)?.id).toBe("store-b");
    expect(
      resolveOwnerActiveStoreRow(stores, {
        preferredStoreId: "store-b",
      })?.id
    ).toBe("store-b");
  });

  it("Owner authority paths do not use raw stores[0] as active-store authority", () => {
    const stripComments = (src: string) =>
      src
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
    const banned = /stores\?\.\[0\]|stores\[0\]/;
    for (const rel of OWNER_AUTHORITY_PATHS) {
      const src = stripComments(read(rel));
      expect(src, rel).not.toMatch(banned);
      expect(src).toMatch(
        /resolveOwnerActiveStore|pickOwnerStoreFromMeList|resolveOwnerActiveStoreIdFromOwnedList|resolveOwnerActiveStoreRowFromOwnedList/
      );
    }
  });

  it("session key constant preserved", () => {
    expect(OWNER_ACTIVE_STORE_SESSION_KEY).toBe("samarket:owner:active-store-id:v1");
  });
});
