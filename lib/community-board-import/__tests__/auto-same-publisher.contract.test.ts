import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AUTO_BOARD_IMPORT_PUBLISH_AUTHORITY,
  boardImportCanonicalPublisher,
  selectAutoPublishArticleIds,
} from "@/lib/community-board-import";

describe("board-import AUTO same-publisher lock", () => {
  it("MANUAL and AUTO share the identical publish function reference", () => {
    expect(boardImportCanonicalPublisher.publish).toBe(AUTO_BOARD_IMPORT_PUBLISH_AUTHORITY);
    expect(boardImportCanonicalPublisher.publish.name).toBe("publishBoardImportArticle");
  });

  it("AUTO runner source imports boardImportCanonicalPublisher.publish only", () => {
    const autoSrc = readFileSync(
      resolve(process.cwd(), "lib/community-board-import/run-auto-board-import.ts"),
      "utf8"
    );
    const publishRoute = readFileSync(
      resolve(process.cwd(), "app/api/admin/community/board-import/publish/route.ts"),
      "utf8"
    );
    expect(autoSrc.includes("boardImportCanonicalPublisher.publish")).toBe(true);
    expect(autoSrc.includes("board_import_publish_article")).toBe(false);
    expect(autoSrc.includes("from(\"community_posts\")")).toBe(false);
    expect(autoSrc.includes(".insert(")).toBe(false);
    expect(publishRoute.includes("boardImportCanonicalPublisher.publish")).toBe(true);
    expect(publishRoute.includes("publishBoardImportArticle")).toBe(false);
    // Both resolve to the same module export surface
    expect(autoSrc.includes('from "@/lib/community-board-import/transform-publish"')).toBe(true);
    expect(publishRoute.includes('from "@/lib/community-board-import/transform-publish"')).toBe(true);
  });

  it("selectAutoPublishArticleIds: NEW only; SOURCE_UPDATED/DUPLICATE never", () => {
    const ids = selectAutoPublishArticleIds([
      {
        outcome: "NEW",
        forbidNewCommunityPost: false,
        articleId: "a-new",
        existingPublishedPostId: null,
      },
      {
        outcome: "DUPLICATE_UNCHANGED",
        forbidNewCommunityPost: true,
        articleId: "a-dup",
        existingPublishedPostId: "post-1",
      },
      {
        outcome: "SOURCE_UPDATED",
        forbidNewCommunityPost: true,
        articleId: "a-upd",
        existingPublishedPostId: "post-1",
      },
      {
        outcome: "NEW",
        forbidNewCommunityPost: true,
        articleId: "a-fail",
        existingPublishedPostId: null,
      },
      {
        outcome: "FINGERPRINT_COLLISION",
        forbidNewCommunityPost: false,
        articleId: "a-coll",
        existingPublishedPostId: null,
      },
    ]);
    expect(ids).toEqual(["a-new"]);
  });
});
