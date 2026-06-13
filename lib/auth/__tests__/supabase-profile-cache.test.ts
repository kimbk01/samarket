import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getSupabaseProfileCache,
  isPostLogoutProfileRehydrateBlocked,
  setSupabaseProfileCache,
} from "@/lib/auth/supabase-profile-cache";
import { POST_LOGOUT_BFCACHE_GUARD_KEY } from "@/lib/auth/client-session-wipe";

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

describe("supabase-profile-cache post_logout_guard", () => {
  let session: Storage;

  beforeEach(() => {
    session = createStorage();
    vi.stubGlobal("window", {} as Window & typeof globalThis);
    vi.stubGlobal("sessionStorage", session);
    setSupabaseProfileCache(null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setSupabaseProfileCache(null);
  });

  it("blocks profile rehydrate while post_logout_guard is active", () => {
    session.setItem(POST_LOGOUT_BFCACHE_GUARD_KEY, "1");
    expect(isPostLogoutProfileRehydrateBlocked()).toBe(true);

    setSupabaseProfileCache({
      id: "u1",
      email: "a@b.com",
      display_name: "Old User",
      nickname: "Old User",
      avatar_url: null,
      temperature: 50,
      provider: null,
      auth_provider: null,
    });

    expect(getSupabaseProfileCache()).toBeNull();
  });

  it("allows clearing profile cache while post_logout_guard is active", () => {
    session.setItem(POST_LOGOUT_BFCACHE_GUARD_KEY, "1");
    setSupabaseProfileCache({
      id: "u1",
      email: "a@b.com",
      display_name: "Old User",
      nickname: "Old User",
      avatar_url: null,
      temperature: 50,
      provider: null,
      auth_provider: null,
    });
    setSupabaseProfileCache(null);
    expect(getSupabaseProfileCache()).toBeNull();
  });
});
