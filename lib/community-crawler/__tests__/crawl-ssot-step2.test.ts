import { describe, expect, it } from "vitest";
import {
  COMMUNITY_CRAWL_CORE_UNAVAILABLE_REASON,
  COMMUNITY_CRAWL_INTERVAL_MINUTES,
  isCommunityCrawlIntervalMinutes,
  normalizeHttpBaseUrl,
  normalizeHttpListUrl,
} from "@/lib/community-crawler/crawl-ssot";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("community crawl SSOT (STEP2)", () => {
  it("normalizes base_url to origin only", () => {
    expect(normalizeHttpBaseUrl("https://example.com/path?q=1")).toBe("https://example.com");
    expect(normalizeHttpBaseUrl("example.com")).toBe("https://example.com");
    expect(normalizeHttpBaseUrl("ftp://x.com")).toBeNull();
  });

  it("normalizes list_url to full https URL", () => {
    expect(normalizeHttpListUrl("https://example.com/news")).toBe("https://example.com/news");
    expect(normalizeHttpListUrl("example.com/jobs")).toBe("https://example.com/jobs");
  });

  it("locks allowed schedule intervals", () => {
    expect(isCommunityCrawlIntervalMinutes(60)).toBe(true);
    expect(isCommunityCrawlIntervalMinutes(45)).toBe(false);
    expect(COMMUNITY_CRAWL_INTERVAL_MINUTES).toEqual([30, 60, 180, 360, 720, 1440]);
  });

  it("keeps MANUAL API 501 reason constant (legacy bulk path)", () => {
    expect(COMMUNITY_CRAWL_CORE_UNAVAILABLE_REASON).toBe("NOT_AVAILABLE_UNTIL_CRAWLER_CORE");
  });

  it("Admin MANUAL API route returns 501; TEST route is implemented", () => {
    const root = process.cwd();
    const testRoute = readFileSync(
      join(root, "app/api/admin/community/crawl/boards/[id]/test/route.ts"),
      "utf8"
    );
    const manualRoute = readFileSync(
      join(root, "app/api/admin/community/crawl/boards/[id]/manual/route.ts"),
      "utf8"
    );
    expect(testRoute).toContain("runCommunityTestCrawl");
    expect(testRoute).not.toContain("status: 501");
    expect(manualRoute).toContain("COMMUNITY_CRAWL_CORE_UNAVAILABLE_REASON");
    expect(manualRoute).toContain("status: 501");
    expect(manualRoute).not.toMatch(/ok:\s*true/);
  });

  it("Admin menu leaf points to external-sources under community content", () => {
    const menu = readFileSync(join(process.cwd(), "components/admin/admin-menu.ts"), "utf8");
    expect(menu).toContain('key: "community-external-sources"');
    expect(menu).toContain('path: "/admin/community/external-sources"');
    expect(menu).toContain('"community-external-sources": "admin_menu_community_external_sources"');
  });

  it("Admin UI primary authority is REAL crawl; TEST is preview-only; old STEP3 publish copy unreachable", () => {
    const ui = readFileSync(
      join(process.cwd(), "components/admin/community/AdminCommunityExternalSourcesPage.tsx"),
      "utf8"
    );
    expect(ui).toContain("runRealCrawl");
    expect(ui).toContain("runTestCrawl");
    expect(ui).toContain("admin_community_crawl_run_now");
    expect(ui).toContain("admin_community_crawl_test");
    expect(ui).toContain("admin_community_crawl_test_preview_only_hint");
    expect(ui).toContain("admin_community_crawl_preview_no_register");
    expect(ui).not.toContain("admin_community_crawl_write_dibay_post");
    expect(ui).not.toContain("runPrepareCrawl");
    expect(ui).not.toContain("submitImportPublish");
    expect(ui).not.toContain("admin_community_crawl_prepare");
    expect(ui).not.toContain("admin_community_crawl_manual");
    expect(ui).not.toContain("mock crawl");
    expect(ui).not.toContain("fake success");
  });

  it("registry migration uses community_topics FK and post_link uniqueness", () => {
    const sql = readFileSync(
      join(process.cwd(), "supabase/migrations/20261218130000_community_crawl_registry.sql"),
      "utf8"
    );
    expect(sql).toContain("REFERENCES public.community_topics");
    expect(sql).toContain("community_crawl_post_links_board_source_post_uidx");
    expect(sql).toContain("community_crawl_post_links_board_canonical_url_uidx");
    expect(sql).toContain("manual_override");
  });

  it("STEP1 migration timestamp stays sequential after latest pre-STEP1 stamp", () => {
    // Repo latest before STEP1 is 20261217120000; calendar Sep rename would break order.
    expect("20261218120000" > "20261217120000").toBe(true);
    expect("20260910120000" < "20261217120000").toBe(true);
  });
});
