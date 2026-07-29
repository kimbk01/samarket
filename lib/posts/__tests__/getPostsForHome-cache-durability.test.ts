import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getPostsForHome,
  invalidateHomePostsCache,
  peekCachedPostsForHome,
  primeHomePostsCache,
} from "@/lib/posts/getPostsForHome";

const SESSION_PREFIX = "samarket:home-posts:v1:";
const LOCAL_PREFIX = "samarket:home-posts:local:v1:";
/** normalizeOptions default key — must stay in sync with getPostsForHome */
const DEFAULT_CACHE_KEY = "1:latest:all:m:all:ts:latest:v4";

const sample = {
  posts: [{ id: "p1" } as never],
  hasMore: false,
  favoriteMap: { p1: true },
};

function sessionKey(cacheKey = DEFAULT_CACHE_KEY): string {
  return `${SESSION_PREFIX}${cacheKey}`;
}

function localKey(cacheKey = DEFAULT_CACHE_KEY): string {
  return `${LOCAL_PREFIX}${cacheKey}`;
}

function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    key(index: number) {
      return [...map.keys()][index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, String(value));
    },
  } as Storage;
}

let sessionStore: Storage;
let localStore: Storage;

beforeEach(() => {
  sessionStore = createMemoryStorage();
  localStore = createMemoryStorage();
  vi.stubGlobal("window", {
    sessionStorage: sessionStore,
    localStorage: localStore,
    dispatchEvent: () => true,
  });
  vi.stubGlobal("sessionStorage", sessionStore);
  vi.stubGlobal("localStorage", localStore);
  invalidateHomePostsCache({ notifyListReload: false });
  sessionStore.clear();
  localStore.clear();
});

afterEach(() => {
  invalidateHomePostsCache({ notifyListReload: false });
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("home posts session expiresAt (Fix 3)", () => {
  it("valid session → peek hit", () => {
    sessionStore.setItem(
      sessionKey(),
      JSON.stringify({ expiresAt: Date.now() + 45_000, data: sample })
    );
    const hit = peekCachedPostsForHome({ sort: "latest", type: null, tradeState: "latest" });
    expect(hit?.posts).toHaveLength(1);
    expect(hit?.favoriteMap.p1).toBe(true);
  });

  it("expiresAt === now → still hit (same as local: < now only)", () => {
    vi.useFakeTimers();
    const now = 1_700_000_000_000;
    vi.setSystemTime(now);
    invalidateHomePostsCache({ notifyListReload: false });
    sessionStore.setItem(sessionKey(), JSON.stringify({ expiresAt: now, data: sample }));
    const hit = peekCachedPostsForHome({ sort: "latest", type: null, tradeState: "latest" });
    expect(hit?.posts).toHaveLength(1);
  });

  it("expired session → miss and key removed; does not paint empty", () => {
    sessionStore.setItem(
      sessionKey(),
      JSON.stringify({ expiresAt: Date.now() - 1, data: sample })
    );
    const hit = peekCachedPostsForHome({ sort: "latest", type: null, tradeState: "latest" });
    expect(hit).toBeNull();
    expect(sessionStore.getItem(sessionKey())).toBeNull();
  });

  it("expired session falls through to valid local", () => {
    sessionStore.setItem(
      sessionKey(),
      JSON.stringify({
        expiresAt: Date.now() - 5_000,
        data: { posts: [{ id: "stale" }], hasMore: false, favoriteMap: {} },
      })
    );
    localStore.setItem(
      localKey(),
      JSON.stringify({
        expiresAt: Date.now() + 86_400_000,
        data: { posts: [{ id: "local-fresh" }], hasMore: false, favoriteMap: {} },
      })
    );
    const hit = peekCachedPostsForHome({ sort: "latest", type: null, tradeState: "latest" });
    expect(hit?.posts[0]?.id).toBe("local-fresh");
  });

  it("malformed JSON → miss without throw", () => {
    sessionStore.setItem(sessionKey(), "{not-json");
    expect(() =>
      peekCachedPostsForHome({ sort: "latest", type: null, tradeState: "latest" })
    ).not.toThrow();
    expect(peekCachedPostsForHome({ sort: "latest", type: null, tradeState: "latest" })).toBeNull();
  });

  it("schema mismatch / missing expiresAt → miss", () => {
    sessionStore.setItem(sessionKey(), JSON.stringify({ data: sample }));
    expect(peekCachedPostsForHome({ sort: "latest", type: null, tradeState: "latest" })).toBeNull();
    sessionStore.setItem(
      sessionKey(),
      JSON.stringify({ expiresAt: Date.now() + 1000, data: { posts: "bad", favoriteMap: {} } })
    );
    expect(peekCachedPostsForHome({ sort: "latest", type: null, tradeState: "latest" })).toBeNull();
  });

  it("unix-seconds expiresAt is not treated as valid ms hit", () => {
    const seconds = Math.floor(Date.now() / 1000) + 3600;
    sessionStore.setItem(sessionKey(), JSON.stringify({ expiresAt: seconds, data: sample }));
    expect(peekCachedPostsForHome({ sort: "latest", type: null, tradeState: "latest" })).toBeNull();
  });
});

describe("home posts durable local write on network (Fix 4)", () => {
  it("network success writes session + local once (single-flight path)", async () => {
    const setItemSpy = vi.spyOn(localStore, "setItem");
    const sessionSetSpy = vi.spyOn(sessionStore, "setItem");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ posts: sample.posts, hasMore: false, favoriteMap: sample.favoriteMap }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
    );

    const [a, b] = await Promise.all([
      getPostsForHome({ sort: "latest", type: null, tradeState: "latest" }),
      getPostsForHome({ sort: "latest", type: null, tradeState: "latest" }),
    ]);
    expect(a.posts).toHaveLength(1);
    expect(b.posts).toHaveLength(1);

    const localWrites = setItemSpy.mock.calls.filter(([k]) => String(k).startsWith(LOCAL_PREFIX));
    const sessionWrites = sessionSetSpy.mock.calls.filter(([k]) => String(k).startsWith(SESSION_PREFIX));
    expect(localWrites.length).toBe(1);
    expect(sessionWrites.length).toBe(1);

    const durable = localStore.getItem(localKey());
    expect(durable).toBeTruthy();
    invalidateHomePostsCache({ notifyListReload: false });
    sessionStore.clear();
    localStore.setItem(localKey(), durable!);
    const fromLocal = peekCachedPostsForHome({ sort: "latest", type: null, tradeState: "latest" });
    expect(fromLocal?.posts[0]?.id).toBe("p1");
  });

  it("network !ok → no local write", async () => {
    const setItemSpy = vi.spyOn(localStore, "setItem");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("err", { status: 500 })));
    await getPostsForHome({ sort: "latest", type: null, tradeState: "latest" });
    const localWrites = setItemSpy.mock.calls.filter(([k]) => String(k).startsWith(LOCAL_PREFIX));
    expect(localWrites.length).toBe(0);
  });

  it("fetch throw → no local write", async () => {
    const setItemSpy = vi.spyOn(localStore, "setItem");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network");
      })
    );
    await getPostsForHome({ sort: "latest", type: null, tradeState: "latest" });
    const localWrites = setItemSpy.mock.calls.filter(([k]) => String(k).startsWith(LOCAL_PREFIX));
    expect(localWrites.length).toBe(0);
  });

  it("localStorage quota throw does not break return", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ posts: [], hasMore: false, favoriteMap: {} }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
    );
    const original = localStore.setItem.bind(localStore);
    vi.spyOn(localStore, "setItem").mockImplementation((key: string, value: string) => {
      if (String(key).startsWith(LOCAL_PREFIX)) {
        throw new DOMException("QuotaExceededError");
      }
      return original(key, value);
    });
    await expect(
      getPostsForHome({ sort: "latest", type: null, tradeState: "latest" })
    ).resolves.toEqual({ posts: [], hasMore: false, favoriteMap: {} });
  });

  it("home vs category-like key do not share local slot", () => {
    primeHomePostsCache({ sort: "latest", type: null, tradeState: "latest" }, sample);
    primeHomePostsCache(
      { sort: "latest", type: null, tradeState: "latest", tradeMarketParentId: "cat-parent-uuid" },
      { posts: [{ id: "cat" } as never], hasMore: false, favoriteMap: {} }
    );
    const homeRaw = localStore.getItem(localKey(DEFAULT_CACHE_KEY));
    const catKey = `1:latest:all:m:cat-parent-uuid:ts:latest:v4`;
    const catRaw = localStore.getItem(localKey(catKey));
    expect(homeRaw).toBeTruthy();
    expect(catRaw).toBeTruthy();
    expect(homeRaw).not.toEqual(catRaw);
  });
});
