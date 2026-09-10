import { describe, expect, it } from "vitest";
import {
  buildReferenceSummaryImportDraft,
  validateReferenceSummaryDraftForPublish,
} from "@/lib/community-crawler/manual-import-draft";
import type { TestCrawlPreviewItem } from "@/lib/community-crawler/core/preview-types";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const preview: TestCrawlPreviewItem = {
  ok: true,
  title: "Source Title From DOT",
  contentPreview: "long source body…",
  contentMarkdown: "This is the full external source body from Travel Philippines. Paragraph two.",
  representativeImageUrl: null,
  bodyImageUrls: [],
  bodyImageCount: 0,
  authorDisplayName: "DOT Writer",
  displayDateIso: "2026-01-01T00:00:00.000Z",
  sourcePublishedAt: "2026-01-01T00:00:00.000Z",
  viewCount: 12,
  sourceUrl: "https://app.philippines.travel/articles/example",
  sourcePostId: "example",
  dibayTopicId: "e0914e34-e44c-42f7-adcc-8f6cf8c7843a",
  dibayTopicName: "여행정보",
  imageMode: "PREVIEW_EXTERNAL_IMAGE_ONLY",
  warnings: [],
};

describe("STEP4 REFERENCE_SUMMARY manual import draft", () => {
  it("does not copy source body into DIBAY draft content", () => {
    const state = buildReferenceSummaryImportDraft({
      preview,
      sourceName: "Travel Philippines — Department of Tourism",
    });
    expect(state.draft.content).toBe("");
    expect(state.draft.requiresAdminBodyEdit).toBe(true);
    expect(state.source.sourceBodyMarkdown).toContain("Travel Philippines");
    expect(state.draft.publishMode).toBe("REFERENCE_SUMMARY");
  });

  it("rejects empty or source-copied body", () => {
    expect(
      validateReferenceSummaryDraftForPublish({
        draftTitle: "DIBAY 제목",
        draftContent: "",
        sourceBodyMarkdown: preview.contentMarkdown,
      }).ok
    ).toBe(false);
    expect(
      validateReferenceSummaryDraftForPublish({
        draftTitle: "DIBAY 제목",
        draftContent: preview.contentMarkdown,
        sourceBodyMarkdown: preview.contentMarkdown,
      }).ok
    ).toBe(false);
    expect(
      validateReferenceSummaryDraftForPublish({
        draftTitle: "세부 여행 팁",
        draftContent: "세부 시티투어 전에 알아두면 좋은 교통·날씨 팁을 정리했습니다.",
        sourceBodyMarkdown: preview.contentMarkdown,
      })
    ).toEqual({ ok: true });
  });

  it("migration adds atomic RPC and publish_mode", () => {
    const sql = readFileSync(
      join(process.cwd(), "supabase/migrations/20261219120000_community_crawl_manual_import_reference_summary.sql"),
      "utf8"
    );
    expect(sql).toContain("publish_mode");
    expect(sql).toContain("REFERENCE_SUMMARY");
    expect(sql).toContain("community_crawl_manual_import_reference_summary");
    expect(sql).toContain("ON DELETE CASCADE");
    expect(sql).not.toContain("applyCommunityPointReward");
  });

  it("writer never calls point reward", () => {
    const writer = readFileSync(
      join(process.cwd(), "lib/community-crawler/manual-import-writer.ts"),
      "utf8"
    );
    expect(writer).not.toMatch(/applyCommunityPointRewardOnPostWrite\s*\(/);
    expect(writer).toContain("MANUAL_IMPORT_POINT_REWARD_FORBIDDEN");
  });

  it("import API route exists; bulk MANUAL crawl stays 501", () => {
    const importRoute = readFileSync(
      join(process.cwd(), "app/api/admin/community/crawl/boards/[id]/import/route.ts"),
      "utf8"
    );
    const manualRoute = readFileSync(
      join(process.cwd(), "app/api/admin/community/crawl/boards/[id]/manual/route.ts"),
      "utf8"
    );
    expect(importRoute).toContain("publishCommunityManualImportReferenceSummary");
    expect(importRoute).not.toContain("applyCommunityPointRewardOnPostWrite");
    expect(manualRoute).toContain("status: 501");
  });
});
