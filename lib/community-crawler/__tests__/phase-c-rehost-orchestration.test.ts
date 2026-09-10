/**
 * PHASE C rehost orchestration tests (mocked storage/DB/fetch).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
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
    canonical_url: "https://example.com/p1",
    source_title: "t",
    source_body_normalized: "body".repeat(20),
    source_author: null,
    source_published_at: null,
    source_cover_url: null,
    source_cover_candidate_url: "https://cdn.example.com/cover.jpg",
    source_body_images: [],
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
    publish_mode: "REFERENCE_SUMMARY",
    created_at: "",
    updated_at: "",
    ...p,
  };
}

describe("PHASE C rehostCommunityCrawlItemMedia", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("MEDIA_REVIEW_REQUIRED → no fetch/rehost", async () => {
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

  it("MEDIA_DISABLED → no rehost", async () => {
    const stats = await rehostCommunityCrawlItemMedia({
      sb: {} as never,
      item: item(),
      source: source({ media_policy: "MEDIA_DISABLED" }),
    });
    expect(stats.skippedPolicy).toBe(true);
    expect(upload).not.toHaveBeenCalled();
  });

  it("manual_override → crawler does not overwrite", async () => {
    const stats = await rehostCommunityCrawlItemMedia({
      sb: {} as never,
      item: item({ manual_override: true }),
      source: source(),
    });
    expect(stats.skippedManualOverride).toBe(true);
    expect(safeFetch).not.toHaveBeenCalled();
  });

  it("MEDIA_ALLOWED + valid jpeg → stored", async () => {
    safeFetch.mockResolvedValue({
      ok: true,
      sourceUrl: "https://cdn.example.com/cover.jpg",
      finalUrl: "https://cdn.example.com/cover.jpg",
      buf: Buffer.from("x"),
      mime: "image/jpeg",
      byteSize: 10,
      width: 100,
      height: 80,
      contentHash: "hash1",
    });
    findByHash.mockResolvedValue(null);
    upload.mockResolvedValue({
      originalPath: "community-crawler/src-1/item-1/hash1.webp",
      publicUrl: "https://storage/example.webp",
      derivativePaths: { thumb: "x.thumb.webp", feed: "x.feed.webp", detail: "x.detail.webp" },
    });
    insertRow.mockResolvedValue({ id: "m1", is_current: true });

    const stats = await rehostCommunityCrawlItemMedia({
      sb: {} as never,
      item: item(),
      source: source(),
    });
    expect(stats.uploaded).toBe(1);
    expect(upload).toHaveBeenCalledOnce();
    expect(insertRow).toHaveBeenCalledOnce();
  });

  it("same bytes recrawl → upload delta 0", async () => {
    safeFetch.mockResolvedValue({
      ok: true,
      sourceUrl: "https://cdn.example.com/cover.jpg",
      finalUrl: "https://cdn.example.com/cover.jpg",
      buf: Buffer.from("x"),
      mime: "image/jpeg",
      byteSize: 10,
      width: 100,
      height: 80,
      contentHash: "hash1",
    });
    findByHash.mockResolvedValue({
      id: "m1",
      is_current: true,
      content_hash: "hash1",
    });

    const stats = await rehostCommunityCrawlItemMedia({
      sb: {} as never,
      item: item(),
      source: source(),
    });
    expect(stats.reused).toBe(1);
    expect(stats.uploaded).toBe(0);
    expect(upload).not.toHaveBeenCalled();
  });

  it("changed bytes → demote old + upload new", async () => {
    safeFetch.mockResolvedValue({
      ok: true,
      sourceUrl: "https://cdn.example.com/cover.jpg",
      finalUrl: "https://cdn.example.com/cover.jpg",
      buf: Buffer.from("y"),
      mime: "image/jpeg",
      byteSize: 11,
      width: 120,
      height: 90,
      contentHash: "hash2",
    });
    findByHash.mockResolvedValue(null);
    upload.mockResolvedValue({
      originalPath: "community-crawler/src-1/item-1/hash2.webp",
      publicUrl: "https://storage/new.webp",
      derivativePaths: {},
    });
    insertRow.mockResolvedValue({ id: "m2", is_current: true });

    const stats = await rehostCommunityCrawlItemMedia({
      sb: {} as never,
      item: item(),
      source: source(),
    });
    expect(stats.uploaded).toBe(1);
    expect(demote).toHaveBeenCalled();
  });

  it("upload success + DB failure → orphan cleanup", async () => {
    safeFetch.mockResolvedValue({
      ok: true,
      sourceUrl: "https://cdn.example.com/cover.jpg",
      finalUrl: "https://cdn.example.com/cover.jpg",
      buf: Buffer.from("x"),
      mime: "image/jpeg",
      byteSize: 10,
      width: 100,
      height: 80,
      contentHash: "hash3",
    });
    findByHash.mockResolvedValue(null);
    upload.mockResolvedValue({
      originalPath: "community-crawler/src-1/item-1/hash3.webp",
      publicUrl: "https://storage/orphan.webp",
      derivativePaths: {},
    });
    insertRow.mockRejectedValue(new Error("db_down"));

    const stats = await rehostCommunityCrawlItemMedia({
      sb: {} as never,
      item: item(),
      source: source(),
    });
    expect(removeAsset).toHaveBeenCalled();
    expect(stats.invalid).toBe(1);
  });

  it("MEDIA_ALLOWED + 404 → no store", async () => {
    safeFetch.mockResolvedValue({
      ok: false,
      sourceUrl: "https://cdn.example.com/missing.jpg",
      reason: "http_error",
      status: 404,
    });
    const stats = await rehostCommunityCrawlItemMedia({
      sb: {} as never,
      item: item(),
      source: source(),
    });
    expect(stats.invalid).toBe(1);
    expect(upload).not.toHaveBeenCalled();
    expect(insertEvent).toHaveBeenCalled();
  });
});
