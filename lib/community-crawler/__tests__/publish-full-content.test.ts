import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validateFullContentDraftForPublish } from "@/lib/community-crawler/publish-full-content-draft";
import { validateReferenceSummaryDraftForPublish } from "@/lib/community-crawler/manual-import-draft";
import {
  COMMUNITY_CRAWL_DEFAULT_PUBLISH_MODE,
  COMMUNITY_CRAWL_LEGACY_PUBLISH_MODE,
  COMMUNITY_CRAWL_V2_PUBLISH_TARGET,
  normalizeCommunityCrawlPublishMode,
} from "@/lib/community-crawler/publish-mode";

const sourceBody = [
  "Plan the best Manila staycation with these tips.",
  "",
  "Paragraph two about hotels and neighborhoods.",
  "",
  "Paragraph three with a [link](https://example.com).",
].join("\n");

describe("V2-1 FULL_CONTENT publish contract", () => {
  it("accepts dibay_body identical to source_body_normalized", () => {
    expect(
      validateFullContentDraftForPublish({
        draftTitle: "Plan the best Manila staycation with these tips.",
        draftContent: sourceBody,
      })
    ).toEqual({ ok: true });
  });

  it("accepts multi-paragraph full body", () => {
    expect(
      validateFullContentDraftForPublish({
        draftTitle: "Cebu Province Tourist Activities",
        draftContent: sourceBody,
      }).ok
    ).toBe(true);
  });

  it("rejects empty/short drafts only", () => {
    const emptyTitle = validateFullContentDraftForPublish({
      draftTitle: "",
      draftContent: sourceBody,
    });
    expect(emptyTitle.ok).toBe(false);
    if (!emptyTitle.ok) expect(emptyTitle.error).toBe("title_required");

    const shortBody = validateFullContentDraftForPublish({
      draftTitle: "Hi",
      draftContent: "short",
    });
    expect(shortBody.ok).toBe(false);
    if (!shortBody.ok) expect(shortBody.error).toBe("dibay_body_too_short");
  });

  it("legacy reference-summary still forbids source copy (isolated)", () => {
    const copied = validateReferenceSummaryDraftForPublish({
      draftTitle: "T",
      draftContent: sourceBody,
      sourceBodyMarkdown: sourceBody,
    });
    expect(copied.ok).toBe(false);
    if (!copied.ok) expect(copied.error).toBe("source_body_copy_forbidden");
  });

  it("FULL_CONTENT is operational default; REFERENCE_SUMMARY remains legacy mode", () => {
    expect(COMMUNITY_CRAWL_V2_PUBLISH_TARGET).toBe("FULL_CONTENT");
    expect(COMMUNITY_CRAWL_DEFAULT_PUBLISH_MODE).toBe("FULL_CONTENT");
    expect(COMMUNITY_CRAWL_LEGACY_PUBLISH_MODE).toBe("REFERENCE_SUMMARY");
    expect(normalizeCommunityCrawlPublishMode("FULL_CONTENT")).toBe("FULL_CONTENT");
    expect(normalizeCommunityCrawlPublishMode("REFERENCE_SUMMARY")).toBe("REFERENCE_SUMMARY");
  });

  it("operational publish route uses FULL_CONTENT writer only", () => {
    const route = readFileSync(
      join(process.cwd(), "app/api/admin/community/crawl/items/[id]/publish/route.ts"),
      "utf8"
    );
    expect(route).toContain("publishCommunityCrawlFullContent");
    expect(route).not.toContain("publishCommunityManualImportReferenceSummary");
    expect(route).not.toContain("source_body_copy_forbidden");
  });

  it("legacy import route is retired 410 without REFERENCE_SUMMARY writer", () => {
    const importRoute = readFileSync(
      join(process.cwd(), "app/api/admin/community/crawl/boards/[id]/import/route.ts"),
      "utf8"
    );
    expect(importRoute).toContain("MANUAL_IMPORT_RETIRED");
    expect(importRoute).not.toContain("publishCommunityManualImportReferenceSummary");
  });

  it("historical V2-1 migration had posts+links only (superseded)", () => {
    const sql = readFileSync(
      join(
        process.cwd(),
        "supabase/migrations/20261226120000_community_crawl_publish_full_content.sql"
      ),
      "utf8"
    );
    expect(sql).toContain("community_crawl_publish_full_content");
    expect(sql).not.toMatch(/INSERT\s+INTO\s+public\.community_post_images/i);
  });

  it("canonical publish migration writes posts+links+images in one RPC", () => {
    const sql = readFileSync(
      join(
        process.cwd(),
        "supabase/migrations/20261228120000_community_crawl_publish_canonical_images.sql"
      ),
      "utf8"
    );
    expect(sql).toContain("community_crawl_publish_full_content");
    expect(sql).toMatch(/INSERT\s+INTO\s+public\.community_post_images/i);
    expect(sql).toMatch(/DELETE\s+FROM\s+public\.community_post_images/i);
    expect(sql).toContain("community_crawl_post_links");
    expect(sql).toContain("'updated'");
  });

  it("writer uses post-link-store and accepts images payload", () => {
    const writer = readFileSync(
      join(process.cwd(), "lib/community-crawler/publish-full-content.ts"),
      "utf8"
    );
    expect(writer).toContain('from "@/lib/community-crawler/post-link-store"');
    expect(writer).toContain("images");
    expect(writer).toContain("FULL_CONTENT_PUBLISH_POINT_REWARD_FORBIDDEN");
    expect(writer).not.toMatch(/applyCommunityPointRewardOnPostWrite\s*\(/);
    expect(writer).not.toContain("/api/community/posts");
  });
});
