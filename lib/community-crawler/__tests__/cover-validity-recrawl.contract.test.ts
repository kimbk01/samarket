import { afterEach, describe, expect, it, vi } from "vitest";
import { contentFingerprint } from "@/lib/community-crawler/core/assign-display-once";

/**
 * Proves dead cover candidate → null durable value changes fingerprint
 * so re-crawl takes UPDATE path and clears existing source_cover_url.
 */
describe("dead cover cleared on recrawl (fingerprint contract)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fingerprint changes when invalid cover becomes null", () => {
    const title = "Cebu Province Tourist Activities";
    const body = "Cebu Province has reopened to domestic tourists…";
    const dead =
      "https://www.datocms-assets.com/31284/1617592887-bojo-river-aloguinsan-cebudji0287-2.jpg?h=720";
    const before = contentFingerprint(title, body, dead);
    const after = contentFingerprint(title, body, null);
    expect(before).not.toBe(after);
  });
});

describe("resolveDurableCoverUrl clears 404 html", async () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns null for 404 text/html candidate", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response("<html>missing</html>", {
          status: 404,
          headers: { "content-type": "text/html" },
        })
      )
    );
    const { resolveDurableCoverUrl } = await import(
      "@/lib/community-crawler/core/validate-cover-candidate"
    );
    const url = await resolveDurableCoverUrl(
      "https://www.datocms-assets.com/31284/dead-cover.jpg?h=720"
    );
    expect(url).toBeNull();
  });
});
