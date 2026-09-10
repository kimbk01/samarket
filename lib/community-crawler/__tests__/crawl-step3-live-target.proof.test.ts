/**
 * STEP3 live target proof — public HTML only (no Supabase credentials).
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseDetailPage, parseListPage } from "@/lib/community-crawler/adapters/generic-html";
import { parseGenericHtmlAdapterConfig } from "@/lib/community-crawler/adapters/generic-html-config";
import { safeFetchHtml } from "@/lib/community-crawler/core/safe-fetch";
import {
  normalizePreviewAuthor,
  normalizePreviewDate,
  normalizePreviewView,
  parseSourceDate,
  parseSourceViewCount,
} from "@/lib/community-crawler/core/normalize";

describe("STEP3 live target HTML — Travel Philippines See & Do", () => {
  it(
    "SAFE FETCH → LIST → DETAIL×5 → NORMALIZE",
    async () => {
      const LIST = "https://app.philippines.travel/articles/category/see-and-do";
      const adapter_config = {
        listItemSelector: "div.css-79elbk",
        detailLinkSelector: 'a[href^="../../articles/"]',
        titleSelector: "h2.css-1ceovz4",
        contentSelector: "div.css-14tykrn:has(p.css-1z9snp)",
        authorSelector: "h2.css-1csuiqk",
        dateSelector: "p.css-1dgfwg3",
      };
      const cfg = parseGenericHtmlAdapterConfig(adapter_config);
      expect(cfg.ok).toBe(true);
      if (!cfg.ok) return;

      const listFetch = await safeFetchHtml(LIST);
      expect(listFetch.status).toBe(200);
      expect(listFetch.contentType).toMatch(/text\/html/i);
      expect(/please wait while your request is being verified/i.test(listFetch.bodyText)).toBe(false);
      expect(/cloudflare|challenge-platform/i.test(listFetch.bodyText)).toBe(false);

      const list = parseListPage(listFetch.bodyText, listFetch.finalUrl, cfg.config);
      expect(list.items.length).toBeGreaterThanOrEqual(5);

      const previews = [];
      const failures = [];
      for (const item of list.items.slice(0, 5)) {
        try {
          const d = await safeFetchHtml(item.detailUrl);
          const parsed = parseDetailPage(d.bodyText, d.finalUrl, cfg.config);
          const stableKey = item.detailUrl;
          const sourceDateIso = parseSourceDate(parsed.dateRaw);
          const sourceView = parseSourceViewCount(parsed.viewRaw);
          const author = normalizePreviewAuthor({
            policy: "SOURCE_AUTHOR",
            config: {},
            sourceAuthor: parsed.author,
            stableKey,
          });
          const date = normalizePreviewDate({
            policy: "SOURCE_DATE",
            config: {},
            sourceDateIso,
            stableKey,
          });
          const view = normalizePreviewView({
            policy: "SOURCE_VIEW",
            config: {},
            sourceView,
            stableKey,
          });
          previews.push({
            title: parsed.title,
            author: author.displayName,
            authorNote: author.note,
            date: date.displayDateIso,
            dateWarning: date.warning,
            view: view.viewCount,
            viewWarning: view.warning,
            rep: parsed.representativeImageUrl,
            bodyImgs: parsed.bodyImageUrls.length,
            url: item.detailUrl,
            contentPreview: parsed.contentMarkdown.slice(0, 220),
            contentLen: parsed.contentMarkdown.length,
            chromeLeak: /Download the app|All rights reserved|Staycations Temporarily/i.test(
              parsed.contentMarkdown
            ),
          });
        } catch (e) {
          failures.push({
            url: item.detailUrl,
            error: e instanceof Error ? e.message : String(e),
            code: e && typeof e === "object" && "code" in e ? String((e as { code: string }).code) : null,
          });
        }
      }

      const out = {
        targetSource: "Travel Philippines — Department of Tourism",
        targetBoard: LIST,
        actualType: "STATIC_HTML",
        contentType: listFetch.contentType,
        listCount: list.items.length,
        previewCount: previews.length,
        failures,
        previews,
        topicMapping: {
          requested: "필리핀 여행정보",
          resolved: "여행정보",
          id: "e0914e34-e44c-42f7-adcc-8f6cf8c7843a",
          note: "exact name missing; closest active topic used for future Admin board mapping",
        },
        policy_status: "REVIEW_REQUIRED",
        genericAdapter: "CONFIG_ONLY",
        selectors: adapter_config,
        imageNote:
          "Cover/rep image lives in __NEXT_DATA__ only; related-card imgs excluded. BODY/REP = NONE via HTML selectors.",
        dbWriteProof: "NOT_RUN_IN_THIS_FILE — separate credentialed count required",
        adminUi: "NOT_RUN — requires Source/Board registry seed",
      };

      writeFileSync(
        resolve(process.cwd(), "tests/e2e/.artifacts/community-crawl-step3-live-target.json"),
        JSON.stringify(out, null, 2)
      );

      expect(previews.length).toBeGreaterThanOrEqual(3);
      expect(failures.length).toBe(0);
      for (const p of previews) {
        expect(p.title.length).toBeGreaterThan(0);
        expect(p.contentLen).toBeGreaterThan(40);
        expect(p.chromeLeak).toBe(false);
      }
    },
    120_000
  );
});
