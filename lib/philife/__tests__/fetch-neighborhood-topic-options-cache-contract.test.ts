import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const PERSISTENT_KEY = "philife_neighborhood_topic_options_v1";

function stalePayload() {
  return {
    ok: true,
    feedChips: [
      { slug: "a", name: "Topic A", is_feed_sort: false },
      { slug: "b", name: "Topic B", is_feed_sort: false },
      { slug: "target", name: "Target", is_feed_sort: false },
    ],
    writeTopics: [],
    showNeighborOnlyFilter: true,
    source: "stale",
  };
}

function freshPayload() {
  return {
    ok: true,
    feedChips: [
      { slug: "target", name: "Target", is_feed_sort: false },
      { slug: "a", name: "Topic A Renamed", is_feed_sort: false, name_en: "A" },
      { slug: "b", name: "Topic B", is_feed_sort: false },
    ],
    writeTopics: [],
    showNeighborOnlyFilter: true,
    source: "fresh",
  };
}

function removedTargetPayload() {
  return {
    ok: true,
    feedChips: [
      { slug: "a", name: "Topic A", is_feed_sort: false },
      { slug: "b", name: "Topic B", is_feed_sort: false },
    ],
    writeTopics: [],
    showNeighborOnlyFilter: true,
    source: "fresh-no-target",
  };
}

describe("fetchPhilifeNeighborhoodTopicOptions cache contract", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
      clear: () => store.clear(),
    });
    (globalThis as { window?: unknown }).window = globalThis;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete (globalThis as { window?: unknown }).window;
  });

  it("CASE1: stale persistent does not short-circuit network; final order is API", async () => {
    localStorage.setItem(PERSISTENT_KEY, JSON.stringify(stalePayload()));
    const fetchMock = vi.fn(async () => ({
      json: async () => freshPayload(),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const mod = await import("@/lib/philife/fetch-neighborhood-topic-options-client");
    const peeked = mod.peekPhilifeNeighborhoodTopicOptionsFromCache();
    expect(peeked?.feedChips?.[0]?.slug).toBe("a");

    const resolved = await mod.fetchPhilifeNeighborhoodTopicOptions();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(resolved.feedChips?.map((c) => c.slug)).toEqual(["target", "a", "b"]);
    expect(JSON.parse(localStorage.getItem(PERSISTENT_KEY)!).feedChips[0].slug).toBe("target");
  });

  it("CASE2: second fetch still hits network (memory TTL is not authority)", async () => {
    const fetchMock = vi.fn(async () => ({
      json: async () => freshPayload(),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const mod = await import("@/lib/philife/fetch-neighborhood-topic-options-client");
    await mod.fetchPhilifeNeighborhoodTopicOptions();
    await mod.fetchPhilifeNeighborhoodTopicOptions();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("CASE3: rename on server updates persistent after fetch", async () => {
    localStorage.setItem(PERSISTENT_KEY, JSON.stringify(stalePayload()));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        json: async () => freshPayload(),
      })),
    );
    const mod = await import("@/lib/philife/fetch-neighborhood-topic-options-client");
    const resolved = await mod.fetchPhilifeNeighborhoodTopicOptions();
    const a = resolved.feedChips?.find((c) => c.slug === "a");
    expect(a?.name).toBe("Topic A Renamed");
  });

  it("CASE4: inactive/removed topic disappears after network refresh", async () => {
    localStorage.setItem(PERSISTENT_KEY, JSON.stringify(stalePayload()));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        json: async () => removedTargetPayload(),
      })),
    );
    const mod = await import("@/lib/philife/fetch-neighborhood-topic-options-client");
    const resolved = await mod.fetchPhilifeNeighborhoodTopicOptions();
    expect(resolved.feedChips?.some((c) => c.slug === "target")).toBe(false);
    expect(resolved.feedChips?.map((c) => c.slug)).toEqual(["a", "b"]);
  });
});
