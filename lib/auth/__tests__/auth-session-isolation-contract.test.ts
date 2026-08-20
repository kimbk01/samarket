import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  APP_LANGUAGE_DEVICE_SEEDED_KEY,
  APP_LANGUAGE_STORAGE_KEY,
} from "@/lib/i18n/config";
import { DIBAY_CLIENT_INSTANCE_ID_KEY } from "@/lib/auth/client-instance-id";

vi.mock("@/components/app/AppBootProvider", () => ({
  invalidateAppBootAll: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseClient: () => ({
    removeAllChannels: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock("@/lib/community-messenger/stores/useCallStore", () => ({
  useCallStore: {
    getState: () => ({ resetCall: vi.fn() }),
  },
}));

vi.mock("@/lib/auth/require-auth-action", () => ({
  clearPendingAuthActions: vi.fn(),
}));

vi.mock("@/lib/posts/getPostsForHome", () => ({
  invalidateHomePostsCache: vi.fn(),
}));

vi.mock("@/lib/auth/login-bootstrap-cache", () => ({
  clearLoginBootstrapSnapshot: vi.fn(),
}));

vi.mock("@/lib/community-messenger/local-store/roomSnapshotDb", () => ({
  clearAllLocalRoomSnapshots: vi.fn().mockResolvedValue(undefined),
}));

const invalidateAuthExitClientCaches = vi.fn();
const clearBrowserCacheStorageBestEffort = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/auth/invalidate-auth-exit-client-caches", () => ({
  invalidateAuthExitClientCaches,
  clearBrowserCacheStorageBestEffort,
}));

function createStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => (map.has(key) ? map.get(key)! : null),
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => {
      map.delete(key);
    },
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };
}

describe("auth session isolation contract", () => {
  let local: Storage;
  let session: Storage;

  beforeEach(() => {
    vi.resetModules();
    invalidateAuthExitClientCaches.mockClear();
    clearBrowserCacheStorageBestEffort.mockClear();
    local = createStorage();
    session = createStorage();
    vi.stubGlobal("window", {
      localStorage: local,
      sessionStorage: session,
      dispatchEvent: vi.fn(),
      caches: {
        keys: vi.fn().mockResolvedValue([]),
        delete: vi.fn().mockResolvedValue(true),
      },
    });
    vi.stubGlobal("localStorage", local);
    vi.stubGlobal("sessionStorage", session);
    local.setItem(APP_LANGUAGE_STORAGE_KEY, "ko");
    local.setItem(APP_LANGUAGE_DEVICE_SEEDED_KEY, "1");
    local.setItem(DIBAY_CLIENT_INSTANCE_ID_KEY, "device-1");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const wipeReasons = ["user_logout", "account_switched", "pre_login_bootstrap"] as const;

  it.each(wipeReasons)("wipeClientSessionState(%s) clears non-user-scoped ephemeral keys", async (reason) => {
    local.setItem("dibay:user-a:pref", "1");
    local.setItem("samarket:stale_route", "/orders/abc");
    local.setItem("kasama_store_commerce_cart_v1", "{}");

    const { wipeClientSessionState } = await import("@/lib/auth/client-session-wipe");
    await wipeClientSessionState(reason, { setPostLogoutGuard: false });

    expect(local.getItem("dibay:user-a:pref")).toBeNull();
    expect(local.getItem("samarket:stale_route")).toBeNull();
    expect(local.getItem("kasama_store_commerce_cart_v1")).toBeNull();
    expect(local.getItem(APP_LANGUAGE_STORAGE_KEY)).toBe("ko");
    expect(local.getItem(DIBAY_CLIENT_INSTANCE_ID_KEY)).toBe("device-1");
    expect(invalidateAuthExitClientCaches).toHaveBeenCalled();
    if (reason === "pre_login_bootstrap") {
      expect(clearBrowserCacheStorageBestEffort).not.toHaveBeenCalled();
    } else {
      expect(clearBrowserCacheStorageBestEffort).toHaveBeenCalled();
    }
  });

  it("clears Cache API only on auth exit reasons", async () => {
    const { wipeClientSessionState } = await import("@/lib/auth/client-session-wipe");

    await wipeClientSessionState("pre_login_bootstrap", { setPostLogoutGuard: false });
    expect(clearBrowserCacheStorageBestEffort).not.toHaveBeenCalled();

    await wipeClientSessionState("user_logout", { setPostLogoutGuard: false });
    expect(clearBrowserCacheStorageBestEffort).toHaveBeenCalledTimes(1);

    await wipeClientSessionState("account_switched", { setPostLogoutGuard: false });
    expect(clearBrowserCacheStorageBestEffort).toHaveBeenCalledTimes(2);
  });

  it("account_switched and user_logout use identical localStorage wipe policy", async () => {
    local.setItem("samarket:trade-write-form-local:cat1", "{}");
    const { wipeClientSessionState } = await import("@/lib/auth/client-session-wipe");

    await wipeClientSessionState("account_switched", { setPostLogoutGuard: false });
    expect(local.getItem("samarket:trade-write-form-local:cat1")).toBeNull();

    local.setItem("samarket:trade-write-form-local:cat1", "{}");
    await wipeClientSessionState("user_logout", { setPostLogoutGuard: false });
    expect(local.getItem("samarket:trade-write-form-local:cat1")).toBeNull();
  });
});

describe("invalidateAuthExitClientCaches", () => {
  it("exports cache invalidators used by wipe", async () => {
    const mod = await import("@/lib/auth/invalidate-auth-exit-client-caches");
    expect(typeof mod.invalidateAuthExitClientCaches).toBe("function");
    expect(typeof mod.clearBrowserCacheStorageBestEffort).toBe("function");
  });

  it("clears OwnerLite via single auth-exit authority (not duplicated in wipe)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const exitSrc = fs.readFileSync(
      path.join(process.cwd(), "lib/auth/invalidate-auth-exit-client-caches.ts"),
      "utf8"
    );
    const wipeSrc = fs.readFileSync(
      path.join(process.cwd(), "lib/auth/client-session-wipe.ts"),
      "utf8"
    );
    expect(exitSrc).toContain("clearOwnerLiteStore()");
    expect(wipeSrc).not.toContain("clearOwnerLiteStore");
    expect(wipeSrc).toContain("invalidateAuthExitClientCaches");
  });
});

describe("resetAuthState contract", () => {
  it("delegates Cache API clear only through wipeClientSessionState", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const source = fs.readFileSync(
      path.join(process.cwd(), "lib/auth/reset-auth-state.ts"),
      "utf8"
    );

    expect(source).toContain('wipeClientSessionState("user_logout"');
    expect(source).not.toContain("clearBrowserCacheStorageBestEffort");
  });
});
