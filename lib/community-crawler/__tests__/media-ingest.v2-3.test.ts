/**
 * V2-3 media ingest contract tests (ladder / validation / rehost orchestration).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { extractCoverCandidateLadder } from "@/lib/community-crawler/media/cover-candidate-ladder";
import { resolveDurableCoverFromLadder } from "@/lib/community-crawler/core/validate-cover-candidate";
import type { CommunityCrawlItemRow, CommunityCrawlSourceRow } from "@/lib/community-crawler/crawl-ssot";

const {
  insertEvent,
  findByHash,
  demote,
  promote,
  insertRow,
  upload,
  removeAsset,
  safeFetch,
} = vi.hoisted(() => ({
  insertEvent: vi.fn(async () => undefined),
  findByHash: vi.fn(),
  demote: vi.fn(async () => undefined),
  promote: vi.fn(async () => undefined),
  insertRow: vi.fn(),
  upload: vi.fn(),
  removeAsset: vi.fn(async () => undefined),
  safeFetch: vi.fn(),
}));

vi.mock("@/lib/community-crawler/core/run-events", () => ({
  insertCommunityCrawlRunEvent: insertEvent,
}));
vi.mock("@/lib/community-crawler/media/item-media-store", () => ({
  findCrawlItemMediaByHash: findByHash,
  demoteCurrentCrawlItemMedia: demote,
  promoteCrawlItemMediaCurrent: promote,
  insertCrawlItemMediaRow: insertRow,
}));
vi.mock("@/lib/media/canonical-image-upload.server", () => ({
  uploadPostImageWithDerivatives: upload,
  removeCanonicalImageAsset: removeAsset,
}));
vi.mock("@/lib/community-crawler/media/safe-fetch-image", async () => {
  const actual = await vi.importActual<typeof import("@/lib/community-crawler/media/safe-fetch-image")>(
    "@/lib/community-crawler/media/safe-fetch-image"
  );
  return {
    ...actual,
    safeFetchCrawlMediaBytes: safeFetch,
  };
});

import { rehostCommunityCrawlItemMedia } from "@/lib/community-crawler/media/rehost-item-media";

function item(p: Partial<CommunityCrawlItemRow> = {}): CommunityCrawlItemRow {
  return {
    id: "item-1",
    source_id: "src-1",
    board_id: "board-1",
    run_id: null,
    source_post_id: "p1",
    canonical_url: "https://example.com/articles/p1",
    source_title: "t",
    source_body_normalized: "body".repeat(20),
    source_author: null,
    source_published_at: null,
    source_cover_url: null,
    source_cover_candidate_url: "https://cdn.example.com/dead-cover.jpg",
    source_body_images: ["https://cdn.example.com/body1.jpg", "https://cdn.example.com/body2.jpg"],
    content_fingerprint: "fp",
    display_author_name: "a",
    display_author_avatar_url: null,
    display_date: null,
    display_view_seed: 1,
    dibay_title: "t",
    dibay_body: "body".repeat(20),
    target_topic_id: "topic",
    status: "REVIEW_REQUIRED",
    manual_override: false,
    published_post_id: null,
    error_code: null,
    error_message: null,
    first_seen_at: "",
    last_seen_at: "",
    last_crawled_at: "",
    created_at: "",
    updated_at: "",
    ...p,
  };
}

function source(p: Partial<CommunityCrawlSourceRow> = {}): CommunityCrawlSourceRow {
  return {
    id: "src-1",
    name: "QA",
    base_url: "https://example.com",
    status: "ACTIVE",
    crawler_type: "generic_html",
    adapter_key: null,
    policy_status: "REVIEW_REQUIRED",
    media_policy: "MEDIA_ALLOWED",
    publish_mode: "FULL_CONTENT",
    created_at: "",
    updated_at: "",
    ...p,
  };
}

function okFetch(url: string, hash: string) {
  return {
    ok: true as const,
    sourceUrl: url,
    finalUrl: url,
    buf: Buffer.from("x"),
    mime: "image/jpeg" as const,
    byteSize: 10,
    width: 100,
    height: 80,
    contentHash: hash,
  };
}

describe("V2-3 cover candidate ladder", () => {
  it("A/B/C: canonical → og → json-ld → body order", () => {
    const html = `
      <html><head>
        <meta property="og:image" content="https://cdn.example.com/og.jpg" />
        <script type="application/ld+json">{"@type":"Article","image":"https://cdn.example.com/ld.jpg"}</script>
      </head><body></body></html>`;
    const ladder = extractCoverCandidateLadder({
      pageUrl: "https://example.com/a",
      html,
      canonicalCoverUrl: "https://cdn.example.com/canonical.jpg",
      articleBodyImageUrls: ["https://cdn.example.com/body.jpg", "https://cdn.example.com/logo.png"],
    });
    expect(ladder[0]).toBe("https://cdn.example.com/canonical.jpg");
    expect(ladder).toContain("https://cdn.example.com/og.jpg");
    expect(ladder).toContain("https://cdn.example.com/ld.jpg");
    expect(ladder).toContain("https://cdn.example.com/body.jpg");
    // logo rejected by identity filter
    expect(ladder.some((u) => /logo/i.test(u))).toBe(false);
  });

  it("rejects tracking/favicon style URLs", () => {
    const ladder = extractCoverCandidateLadder({
      pageUrl: "https://example.com/a",
      html: "",
      canonicalCoverUrl: "https://cdn.example.com/pixel.gif",
      articleBodyImageUrls: ["https://cdn.example.com/ok.jpg"],
    });
    expect(ladder).toEqual(["https://cdn.example.com/ok.jpg"]);
  });
});

describe("V2-3 resolveDurableCoverFromLadder", () => {
  it("D: empty ladder → NO_CANDIDATE", async () => {
    const r = await resolveDurableCoverFromLadder([]);
    expect(r.state).toBe("NO_CANDIDATE");
    expect(r.durableUrl).toBeNull();
    expect(r.attempted).toBe(0);
  });
});

describe("V2-3 rehostCommunityCrawlItemMedia", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("A: valid cover → COVER materialized", async () => {
    safeFetch.mockResolvedValue(okFetch("https://cdn.example.com/dead-cover.jpg", "h1"));
    findByHash.mockResolvedValue(null);
    upload.mockResolvedValue({
      originalPath: "community-crawler/src-1/item-1/h1.webp",
      publicUrl: "https://storage/h1.webp",
    });
    insertRow.mockResolvedValue({ id: "m1", is_current: true, content_hash: "h1" });

    const stats = await rehostCommunityCrawlItemMedia({
      sb: {} as never,
      item: item({ source_body_images: [] }),
      source: source(),
    });
    expect(stats.coverState).toBe("VALID");
    expect(stats.uploaded).toBe(1);
    expect(insertRow).toHaveBeenCalled();
  });

  it("B: cover 404 → fallback body as COVER", async () => {
    safeFetch.mockImplementation(async (url: string) => {
      if (String(url).includes("dead-cover")) {
        return { ok: false, sourceUrl: url, reason: "http_error", status: 404 };
      }
      return okFetch(String(url), "bodyhash");
    });
    findByHash.mockResolvedValue(null);
    upload.mockResolvedValue({
      originalPath: "community-crawler/src-1/item-1/bodyhash.webp",
      publicUrl: "https://storage/body.webp",
    });
    insertRow.mockResolvedValue({ id: "m2", is_current: true, content_hash: "bodyhash" });

    const stats = await rehostCommunityCrawlItemMedia({
      sb: {} as never,
      item: item({
        source_cover_candidate_url: "https://cdn.example.com/dead-cover.jpg",
        source_cover_url: null,
        source_body_images: ["https://cdn.example.com/body1.jpg"],
      }),
      source: source(),
    });
    expect(stats.coverState).toBe("VALID");
    expect(stats.invalid).toBeGreaterThanOrEqual(1);
    expect(upload).toHaveBeenCalled();
  });

  it("D: all cover ladder invalid → NO_VALID_IMAGE", async () => {
    safeFetch.mockResolvedValue({ ok: false, sourceUrl: "x", reason: "http_error", status: 404 });
    const stats = await rehostCommunityCrawlItemMedia({
      sb: {} as never,
      item: item({ source_body_images: ["https://cdn.example.com/also-dead.jpg"] }),
      source: source(),
    });
    expect(stats.coverState).toBe("NO_VALID_IMAGE");
    expect(upload).not.toHaveBeenCalled();
  });

  it("E/F/G: invalid fetch reasons counted (html/corrupt/ssrf)", async () => {
    safeFetch.mockResolvedValue({ ok: false, sourceUrl: "x", reason: "mime_rejected" });
    const stats = await rehostCommunityCrawlItemMedia({
      sb: {} as never,
      item: item({ source_body_images: [] }),
      source: source(),
    });
    expect(stats.invalid).toBeGreaterThanOrEqual(1);
    expect(stats.coverState).toBe("NO_VALID_IMAGE");
  });

  it("H: body images preserve sort_order", async () => {
    safeFetch.mockImplementation(async (url: string) => okFetch(String(url), String(url)));
    findByHash.mockResolvedValue(null);
    upload.mockImplementation(async ({ originalPath }: { originalPath: string }) => ({
      originalPath,
      publicUrl: `https://storage/${originalPath}`,
    }));
    insertRow.mockImplementation(async (row: { sortOrder: number; role: string; contentHash: string }) => ({
      id: `m-${row.contentHash}`,
      is_current: true,
      content_hash: row.contentHash,
      sort_order: row.sortOrder,
      role: row.role,
    }));

    await rehostCommunityCrawlItemMedia({
      sb: {} as never,
      item: item({
        source_cover_candidate_url: "https://cdn.example.com/cover.jpg",
        source_cover_url: "https://cdn.example.com/cover.jpg",
        source_body_images: ["https://cdn.example.com/a.jpg", "https://cdn.example.com/b.jpg"],
      }),
      source: source(),
    });

    const roles = insertRow.mock.calls.map(
      (c) => (c[1] as { role: string; sortOrder: number }).role
    );
    const bodyInserts = insertRow.mock.calls
      .map((c) => c[1] as { role: string; sortOrder: number })
      .filter((r) => r.role === "BODY");
    expect(roles).toEqual(["COVER", "BODY", "BODY"]);
    expect(bodyInserts.map((r) => r.sortOrder)).toEqual([0, 1]);
  });

  it("I: same hash recrawl → duplicate upload 0", async () => {
    safeFetch.mockResolvedValue(okFetch("https://cdn.example.com/dead-cover.jpg", "same"));
    findByHash.mockResolvedValue({
      id: "m1",
      is_current: true,
      content_hash: "same",
      sort_order: 0,
    });
    const stats = await rehostCommunityCrawlItemMedia({
      sb: {} as never,
      item: item({ source_body_images: [] }),
      source: source(),
    });
    expect(stats.reused).toBe(1);
    expect(stats.uploaded).toBe(0);
    expect(upload).not.toHaveBeenCalled();
  });

  it("J: changed cover → demote previous COVER", async () => {
    safeFetch.mockResolvedValue(okFetch("https://cdn.example.com/new.jpg", "newhash"));
    findByHash.mockResolvedValue(null);
    upload.mockResolvedValue({
      originalPath: "community-crawler/src-1/item-1/newhash.webp",
      publicUrl: "https://storage/new.webp",
    });
    insertRow.mockResolvedValue({ id: "m-new", is_current: true, content_hash: "newhash" });

    await rehostCommunityCrawlItemMedia({
      sb: {} as never,
      item: item({
        source_cover_candidate_url: "https://cdn.example.com/new.jpg",
        source_body_images: [],
      }),
      source: source(),
    });
    expect(demote).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ role: "COVER" })
    );
  });

  it("L: MEDIA_REVIEW_REQUIRED → rehost delta 0", async () => {
    const stats = await rehostCommunityCrawlItemMedia({
      sb: {} as never,
      item: item(),
      source: source({ media_policy: "MEDIA_REVIEW_REQUIRED" }),
    });
    expect(stats.skippedPolicy).toBe(true);
    expect(stats.attempted).toBe(0);
    expect(safeFetch).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });
});

describe("V2-3 TEST / post_images boundaries (contract)", () => {
  it("K: TEST crawl path does not import rehost writer", async () => {
    const src = await import("@/lib/community-crawler/core/run-test-crawl");
    expect(typeof src.runCommunityTestCrawl).toBe("function");
    // Structural: module must not call rehost — verified by source inspection in companion test below.
  });

  it("community_post_images write surface absent from rehost module", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const text = fs.readFileSync(
      path.resolve(process.cwd(), "lib/community-crawler/media/rehost-item-media.ts"),
      "utf8"
    );
    expect(text.includes('.from("community_post_images")')).toBe(false);
    expect(text.includes("insert into community_post_images")).toBe(false);
    const testCrawl = fs.readFileSync(
      path.resolve(process.cwd(), "lib/community-crawler/core/run-test-crawl.ts"),
      "utf8"
    );
    expect(testCrawl.includes("rehostCommunityCrawlItemMedia")).toBe(false);
    expect(testCrawl.includes("community_crawl_item_media")).toBe(false);
  });
});
