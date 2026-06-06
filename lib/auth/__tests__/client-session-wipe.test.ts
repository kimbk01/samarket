import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  APP_LANGUAGE_DEVICE_SEEDED_KEY,
  APP_LANGUAGE_STORAGE_KEY,
} from "@/lib/i18n/config";

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

describe("wipeClientSessionState storage allowlist", () => {
  let local: Storage;
  let session: Storage;

  beforeEach(() => {
    vi.resetModules();
    local = createStorage();
    session = createStorage();
    vi.stubGlobal("window", {
      localStorage: local,
      sessionStorage: session,
      dispatchEvent: vi.fn(),
    });
    vi.stubGlobal("localStorage", local);
    vi.stubGlobal("sessionStorage", session);
    local.setItem(APP_LANGUAGE_STORAGE_KEY, "ko");
    local.setItem(APP_LANGUAGE_DEVICE_SEEDED_KEY, "1");
    local.setItem("kasama_store_commerce_cart_v1", "{}");
    local.setItem("samarket:trade-write-form-local:cat1", "{}");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("clears ephemeral keys but keeps language allowlist", async () => {
    const { wipeClientSessionState } = await import("@/lib/auth/client-session-wipe");
    await wipeClientSessionState("pre_login_bootstrap", { setPostLogoutGuard: false });

    expect(local.getItem(APP_LANGUAGE_STORAGE_KEY)).toBe("ko");
    expect(local.getItem(APP_LANGUAGE_DEVICE_SEEDED_KEY)).toBe("1");
    expect(local.getItem("kasama_store_commerce_cart_v1")).toBeNull();
    expect(local.getItem("samarket:trade-write-form-local:cat1")).toBeNull();
  });

  it("sets post logout bfcache guard on user_logout", async () => {
    const { wipeClientSessionState, POST_LOGOUT_BFCACHE_GUARD_KEY } = await import(
      "@/lib/auth/client-session-wipe"
    );
    await wipeClientSessionState("user_logout");
    expect(session.getItem(POST_LOGOUT_BFCACHE_GUARD_KEY)).toBe("1");
  });

  it("coalesces concurrent wipe calls via single-flight", async () => {
    const { wipeClientSessionState } = await import("@/lib/auth/client-session-wipe");
    const { invalidateAppBootAll } = await import("@/components/app/AppBootProvider");
    const spy = vi.mocked(invalidateAppBootAll);

    await Promise.all([
      wipeClientSessionState("pre_login_bootstrap", { setPostLogoutGuard: false }),
      wipeClientSessionState("user_logout"),
    ]);

    expect(spy.mock.calls.length).toBe(1);
  });

  it("syncSignedOutClientCaches clears auth caches without storage wipe", async () => {
    const { syncSignedOutClientCaches } = await import("@/lib/auth/client-session-wipe");
    const { invalidateAppBootAll } = await import("@/components/app/AppBootProvider");
    local.setItem("kasama_store_commerce_cart_v1", "{}");

    syncSignedOutClientCaches();

    expect(vi.mocked(invalidateAppBootAll)).toHaveBeenCalled();
    expect(local.getItem("kasama_store_commerce_cart_v1")).toBe("{}");
  });

  it("shouldSkipSignedOutEventWipe after markExplicitLogoutWipeDone", async () => {
    const {
      markExplicitLogoutWipeDone,
      shouldSkipSignedOutEventWipe,
    } = await import("@/lib/auth/client-session-wipe");

    expect(shouldSkipSignedOutEventWipe()).toBe(false);
    markExplicitLogoutWipeDone();
    expect(shouldSkipSignedOutEventWipe()).toBe(true);
  });
});
