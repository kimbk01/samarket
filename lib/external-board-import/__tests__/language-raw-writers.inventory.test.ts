/**
 * Language field writers / RAW-DRAFT-PUBLISH mutation inventory (code authority).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

describe("language writers + raw/draft mutation inventory", () => {
  it("source_language / detected_language / display_language writers are constrained", () => {
    const discovery = readFileSync(
      join(root, "lib/external-board-import/discovery/article-discovery.ts"),
      "utf8"
    );
    // Discover may set source_language + display_language from resolveArticleSourceLanguage.
    expect(discovery).toContain("resolveArticleSourceLanguage");
    expect(discovery).toContain("detected_language: null");
    // Must not invent detected_language
    expect(discovery).not.toMatch(/detected_language:\s*sourceLanguage/);
    expect(discovery).not.toMatch(/detected_language:\s*["']en["']/);

    const language = readFileSync(
      join(root, "lib/external-board-import/catalog/language.ts"),
      "utf8"
    );
    expect(language).toContain("Never fabricates detected_language");
    expect(language).toContain("draft_ko");
    expect(language).toContain("assertWritableTranslationStatus");
  });

  it("draft route never mutates source_* columns; publish failure does not set edit published", () => {
    const draft = readFileSync(
      join(root, "app/api/admin/community/external-board/articles/[id]/draft/route.ts"),
      "utf8"
    );
    expect(draft).not.toMatch(/^\s*source_document\s*:/m);
    expect(draft).not.toMatch(/^\s*source_title\s*:/m);
    expect(draft).toContain('edit_status: "transformed"');
    expect(draft).toContain('action === "revert"');

    const pub = readFileSync(
      join(root, "lib/external-board-import/publish/canonical-publisher.ts"),
      "utf8"
    );
    expect(pub).toContain('edit_status: "published"');
    const failedFn = pub.match(/async function markArticleFailed[\s\S]*?\n\}/);
    expect(failedFn?.[0]).toContain('ops_status: "failed"');
    expect(failedFn?.[0]).not.toMatch(/edit_status\s*:/);
  });

  it("replacement policy does not write source_document", () => {
    const replacement = readFileSync(
      join(root, "lib/external-board-import/policy/replacement.ts"),
      "utf8"
    );
    expect(replacement).not.toContain("source_document");
    expect(replacement).not.toContain("community_posts");
  });
});
