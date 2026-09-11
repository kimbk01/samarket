/**
 * Auto-publish orchestration contract tests (ROOT A).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CommunityCrawlBoardRow, CommunityCrawlItemRow, CommunityCrawlSourceRow } from "@/lib/community-crawler/crawl-ssot";
import { COMMUNITY_CRAWL_SCHEDULER_FROZEN } from "@/lib/community-crawler/crawl-ssot";
import { emptyAutoPublishAttemptStats } from "@/lib/community-crawler/auto-publish-after-crawl";

const {
  findLink,
  publishFull,
  insertEvent,
  validateDraft,
} = vi.hoisted(() => ({
  findLink: vi.fn(),
  publishFull: vi.fn(),
  insertEvent: vi.fn(async () => undefined),
  validateDraft: vi.fn(),
}));

vi.mock("@/lib/community-crawler/manual-import-writer", () => ({
  findExistingCommunityCrawlPostLink: findLink,
}));
vi.mock("@/lib/community-crawler/publish-full-content", () => ({
  publishCommunityCrawlFullContent: publishFull,
}));
vi.mock("@/lib/community-crawler/core/run-events", () => ({
  insertCommunityCrawlRunEvent: insertEvent,
}));
vi.mock("@/lib/community-crawler/publish-full-content-draft", () => ({
  validateFullContentDraftForPublish: validateDraft,
}));

import { attemptAutoPublishAfterCrawl } from "@/lib/community-crawler/auto-publish-after-crawl";
import { resolveCommunityCrawlPublishEligibility } from "@/lib/community-crawler/publish-eligibility";

function source(p: Partial<CommunityCrawlSourceRow> = {}): CommunityCrawlSourceRow {
  return {
    id: "src-1",
    name: "QA",
    base_url: "https://example.com",
    status: "ACTIVE",
    crawler_type: "generic_html",
    adapter_key: null,
    policy_status: "ALLOWED",
    media_policy: "MEDIA_REVIEW_REQUIRED",
    publish_mode: "FULL_CONTENT",
    created_at: "",
    updated_at: "",
    ...p,
  };
}

function board(p: Partial<CommunityCrawlBoardRow> = {}): CommunityCrawlBoardRow {
  return {
    id: "board-1",
    source_id: "src-1",
    name: "QA Board",
    list_url: "https://example.com/list",
    dibay_topic_id: "topic-1",
    crawl_mode: "generic_html",
    adapter_config: {},
    ingest_mode: "AUTO_PUBLISH",
    update_policy: "CREATE_ONLY",
    author_policy: "SOURCE_AUTHOR",
    author_config: {},
    date_policy: "SOURCE_DATE",
    date_config: {},
    view_policy: "SOURCE_VIEW",
    view_config: {},
    schedule_enabled: false,
    crawl_interval_minutes: 60,
    max_pages: 1,
    max_posts: 5,
    enabled: true,
    last_run_at: null,
    last_success_at: null,
    last_error: null,
    next_run_at: null,
    created_at: "",
    updated_at: "",
    ...p,
  } as CommunityCrawlBoardRow;
}

function item(p: Partial<CommunityCrawlItemRow> = {}): CommunityCrawlItemRow {
  return {
    id: "item-1",
    source_id: "src-1",
    board_id: "board-1",
    run_id: null,
    source_post_id: "p1",
    canonical_url: "https://example.com/p1",
    source_title: "Title here",
    source_body_normalized: "Body content that is long enough to publish.",
    source_author: null,
    source_published_at: null,
    source_cover_url: null,
    source_cover_candidate_url: null,
    source_body_images: [],
    content_fingerprint: "fp",
    display_author_name: "Author",
    display_author_avatar_url: null,
    display_date: null,
    display_view_seed: 1,
    dibay_title: "Title here",
    dibay_body: "Body content that is long enough to publish.",
    target_topic_id: "topic-1",
    status: "READY",
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

function sbMock(updateResult: unknown = { id: "item-1", status: "PUBLISHED" }) {
  return {
    from: vi.fn(() => ({
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(async () => ({ data: updateResult, error: null })),
          })),
          // for heal path without select
          then: undefined,
        })),
      })),
    })),
  } as never;
}

describe("resolveCommunityCrawlPublishEligibility", () => {
  afterEach(() => vi.clearAllMocks());

  it("A: AUTO_PUBLISH eligible → ok", async () => {
    findLink.mockResolvedValue(null);
    validateDraft.mockReturnValue({ ok: true });
    const r = await resolveCommunityCrawlPublishEligibility({} as never, {
      source: source(),
      board: board(),
      item: item(),
      mode: "auto",
    });
    expect(r.ok).toBe(true);
  });

  it("B: REVIEW_THEN_PUBLISH → skip mode", async () => {
    findLink.mockResolvedValue(null);
    validateDraft.mockReturnValue({ ok: true });
    const r = await resolveCommunityCrawlPublishEligibility({} as never, {
      source: source(),
      board: board({ ingest_mode: "REVIEW_THEN_PUBLISH" }),
      item: item(),
      mode: "auto",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("BOARD_NOT_AUTO_PUBLISH");
  });

  it("C: REVIEW_REQUIRED policy → skip", async () => {
    const r = await resolveCommunityCrawlPublishEligibility({} as never, {
      source: source({ policy_status: "REVIEW_REQUIRED" }),
      board: board(),
      item: item(),
      mode: "auto",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("SOURCE_POLICY_NOT_ALLOWED");
  });

  it("D: inactive source → skip", async () => {
    const r = await resolveCommunityCrawlPublishEligibility({} as never, {
      source: source({ status: "PAUSED" as never }),
      board: board(),
      item: item(),
      mode: "auto",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("SOURCE_NOT_ACTIVE");
  });

  it("E: already published → duplicate", async () => {
    const r = await resolveCommunityCrawlPublishEligibility({} as never, {
      source: source(),
      board: board(),
      item: item({ published_post_id: "post-1", status: "PUBLISHED" }),
      mode: "auto",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("ALREADY_PUBLISHED");
  });

  it("E2: existing post link → duplicate", async () => {
    findLink.mockResolvedValue({ communityPostId: "post-9", linkId: "link-9" });
    const r = await resolveCommunityCrawlPublishEligibility({} as never, {
      source: source(),
      board: board(),
      item: item(),
      mode: "auto",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("ALREADY_LINKED");
  });

  it("G: invalid draft → fail reason", async () => {
    findLink.mockResolvedValue(null);
    validateDraft.mockReturnValue({ ok: false, error: "dibay_body_too_short" });
    const r = await resolveCommunityCrawlPublishEligibility({} as never, {
      source: source(),
      board: board(),
      item: item({ dibay_body: "x", source_body_normalized: "x" }),
      mode: "auto",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("DRAFT_INVALID");
      expect(r.detail).toBe("dibay_body_too_short");
    }
  });

  it("J: Travel PH-like config → blocked", async () => {
    const r = await resolveCommunityCrawlPublishEligibility({} as never, {
      source: source({ policy_status: "REVIEW_REQUIRED", media_policy: "MEDIA_REVIEW_REQUIRED" }),
      board: board({ ingest_mode: "REVIEW_THEN_PUBLISH" }),
      item: item({ status: "REVIEW_REQUIRED" }),
      mode: "auto",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("SOURCE_POLICY_NOT_ALLOWED");
  });
});

describe("attemptAutoPublishAfterCrawl", () => {
  afterEach(() => vi.clearAllMocks());

  it("A/F: eligible → publisher called and published", async () => {
    findLink.mockResolvedValue(null);
    validateDraft.mockReturnValue({ ok: true });
    publishFull.mockResolvedValue({
      ok: true,
      communityPostId: "post-new",
      postLinkId: "link-new",
      publishMode: "FULL_CONTENT",
    });
    const stats = emptyAutoPublishAttemptStats();
    const r = await attemptAutoPublishAfterCrawl({
      sb: sbMock({ id: "item-1", status: "PUBLISHED", published_post_id: "post-new" }),
      source: source(),
      board: board(),
      item: item(),
      runId: "run-1",
      stats,
    });
    expect(r.outcome).toBe("published");
    expect(publishFull).toHaveBeenCalledOnce();
    expect(stats.published).toBe(1);
    expect(insertEvent).toHaveBeenCalled();
  });

  it("B: REVIEW_THEN_PUBLISH → publisher not called", async () => {
    findLink.mockResolvedValue(null);
    validateDraft.mockReturnValue({ ok: true });
    const stats = emptyAutoPublishAttemptStats();
    const r = await attemptAutoPublishAfterCrawl({
      sb: {} as never,
      source: source(),
      board: board({ ingest_mode: "REVIEW_THEN_PUBLISH" }),
      item: item(),
      runId: "run-1",
      stats,
    });
    expect(r.outcome).toBe("skipped_mode");
    expect(publishFull).not.toHaveBeenCalled();
    expect(stats.skippedMode).toBe(1);
  });

  it("C: policy block → publisher not called", async () => {
    const stats = emptyAutoPublishAttemptStats();
    const r = await attemptAutoPublishAfterCrawl({
      sb: {} as never,
      source: source({ policy_status: "REVIEW_REQUIRED" }),
      board: board(),
      item: item(),
      runId: "run-1",
      stats,
    });
    expect(r.outcome).toBe("skipped_policy");
    expect(publishFull).not.toHaveBeenCalled();
  });

  it("H: publish error → item durable, error recorded", async () => {
    findLink.mockResolvedValue(null);
    validateDraft.mockReturnValue({ ok: true });
    publishFull.mockResolvedValue({ ok: false, error: "topic_not_found", httpStatus: 400 });
    const stats = emptyAutoPublishAttemptStats();
    const before = item();
    const r = await attemptAutoPublishAfterCrawl({
      sb: {} as never,
      source: source(),
      board: board(),
      item: before,
      runId: "run-1",
      stats,
    });
    expect(r.outcome).toBe("failed");
    expect(before.dibay_title).toBe("Title here");
    expect(before.published_post_id).toBeNull();
    expect(stats.failed).toBe(1);
    expect(insertEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ classification: "FAILED" })
    );
  });

  it("I: manual override → uses preserved dibay_* (no overwrite path)", async () => {
    findLink.mockResolvedValue(null);
    validateDraft.mockReturnValue({ ok: true });
    publishFull.mockResolvedValue({
      ok: true,
      communityPostId: "post-m",
      postLinkId: "link-m",
      publishMode: "FULL_CONTENT",
    });
    const stats = emptyAutoPublishAttemptStats();
    const manual = item({
      manual_override: true,
      dibay_title: "Manual Title",
      dibay_body: "Manual body that is long enough to publish.",
      source_title: "Source Title",
      source_body_normalized: "Source body that is long enough.",
    });
    await attemptAutoPublishAfterCrawl({
      sb: sbMock(),
      source: source(),
      board: board(),
      item: manual,
      runId: "run-1",
      stats,
    });
    expect(publishFull).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        title: "Manual Title",
        content: "Manual body that is long enough to publish.",
      })
    );
  });
});

describe("boundary locks", () => {
  it("K: scheduler still FROZEN", () => {
    expect(COMMUNITY_CRAWL_SCHEDULER_FROZEN).toBe(true);
  });

  it("L: replacement engine not imported by auto-publish module", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const text = fs.readFileSync(
      path.resolve(process.cwd(), "lib/community-crawler/auto-publish-after-crawl.ts"),
      "utf8"
    );
    expect(text.includes("replacement")).toBe(false);
    expect(text.includes("publishCommunityCrawlFullContent")).toBe(true);
  });

  it("REAL crawl wires auto-publish after media", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const text = fs.readFileSync(
      path.resolve(process.cwd(), "lib/community-crawler/core/run-real-crawl.ts"),
      "utf8"
    );
    expect(text.includes("attemptAutoPublishAfterCrawl")).toBe(true);
    expect(text.includes("rehostCommunityCrawlItemMedia")).toBe(true);
    const mediaIdx = text.indexOf("rehostCommunityCrawlItemMedia");
    const pubIdx = text.indexOf("attemptAutoPublishAfterCrawl");
    expect(pubIdx).toBeGreaterThan(mediaIdx);
  });
});
