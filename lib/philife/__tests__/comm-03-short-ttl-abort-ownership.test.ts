import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { forgetSingleFlightsWhere } from "@/lib/http/run-single-flight";
import {
  fetchNeighborhoodFeedShortTtl,
  invalidateNeighborhoodFeedClientShortTtl,
  resetNeighborhoodFeedClientShortTtlMetricsForTests,
} from "@/lib/philife/fetch-neighborhood-feed-short-ttl";

const FEED_URL = "https://example.test/api/philife/neighborhood-feed?sort=latest";

describe("COMM-03 short-ttl abort ownership", () => {
  beforeEach(() => {
    resetNeighborhoodFeedClientShortTtlMetricsForTests();
    invalidateNeighborhoodFeedClientShortTtl();
    forgetSingleFlightsWhere((k) => typeof k === "string" && k.startsWith("philifeNeighborhoodFeedShortTtl:"));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetNeighborhoodFeedClientShortTtlMetricsForTests();
    invalidateNeighborhoodFeedClientShortTtl();
  });

  it("one consumer abort does not kill shared network flight for another waiter", async () => {
    let resolveFetch!: (r: Response) => void;
    const fetchStarted = new Promise<void>((resolve) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(
          () =>
            new Promise<Response>((res) => {
              resolve();
              resolveFetch = res;
            })
        )
      );
    });

    const acA = new AbortController();
    const pA = fetchNeighborhoodFeedShortTtl(FEED_URL, {
      credentials: "include",
      signal: acA.signal,
    });
    await fetchStarted;

    const pB = fetchNeighborhoodFeedShortTtl(FEED_URL, {
      credentials: "include",
    });

    acA.abort();
    await expect(pA).rejects.toMatchObject({ name: "AbortError" });

    resolveFetch(new Response(JSON.stringify({ ok: true, posts: [] }), { status: 200 }));
    const resB = await pB;
    expect(resB.status).toBe(200);
    const body = (await resB.json()) as { ok?: boolean };
    expect(body.ok).toBe(true);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    expect((init as RequestInit | undefined)?.signal).toBeUndefined();
  });

  it("source contract: shared fetch uses stripped init; CommunityFeed still passes signal", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const ttl = readFileSync(
      resolve(process.cwd(), "lib/philife/fetch-neighborhood-feed-short-ttl.ts"),
      "utf8"
    );
    expect(ttl).toContain("initWithoutConsumerSignal");
    expect(ttl).toContain("awaitBoxedForConsumer");
    expect(ttl).toContain("fetch(url, sharedInit)");
    const feed = readFileSync(
      resolve(process.cwd(), "components/community/CommunityFeed.tsx"),
      "utf8"
    );
    expect(feed).toContain("signal: controller.signal");
    expect(feed).toContain("28_000");
    expect(feed).toContain("session !== feedSessionRef.current");
  });
});
