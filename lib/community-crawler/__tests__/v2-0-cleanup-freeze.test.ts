import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  COMMUNITY_CRAWL_PREPARE_AVAILABLE,
  COMMUNITY_CRAWL_SCHEDULER_FROZEN,
  COMMUNITY_CRAWL_SCHEDULER_FREEZE_STATE,
  COMMUNITY_CRAWL_V2_PUBLISH_TARGET,
} from "@/lib/community-crawler/crawl-ssot";
import {
  COMMUNITY_CRAWL_LEGACY_PUBLISH_MODE,
  COMMUNITY_CRAWL_V2_PUBLISH_TARGET as PUBLISH_TARGET,
} from "@/lib/community-crawler/publish-mode";

describe("community crawler V2-0 cleanup / SSOT freeze", () => {
  it("freezes Production scheduler with machine-readable state", () => {
    expect(COMMUNITY_CRAWL_SCHEDULER_FROZEN).toBe(true);
    expect(COMMUNITY_CRAWL_SCHEDULER_FREEZE_STATE).toBe("CRAWLER_SCHEDULER_FROZEN");
    const cron = readFileSync(
      join(process.cwd(), "app/api/cron/community-crawl-dispatcher/route.ts"),
      "utf8"
    );
    expect(cron).toContain("COMMUNITY_CRAWL_SCHEDULER_FROZEN");
    expect(cron).toContain("COMMUNITY_CRAWL_SCHEDULER_FREEZE_STATE");
    expect(cron).toContain("runs_created: 0");
    expect(cron).toContain("item_mutations: 0");
    expect(cron).toContain("media_mutations: 0");
    expect(cron).not.toContain("runCommunityRealCrawl");
  });

  it("retires prepare route as 410 PREPARE_RETIRED", () => {
    expect(COMMUNITY_CRAWL_PREPARE_AVAILABLE).toBe(false);
    const prepare = readFileSync(
      join(process.cwd(), "app/api/admin/community/crawl/boards/[id]/prepare/route.ts"),
      "utf8"
    );
    expect(prepare).toContain("PREPARE_RETIRED");
    expect(prepare).toContain("status: 410");
    expect(prepare).not.toContain("runCommunityTestCrawl");
    expect(prepare).not.toContain("buildPreparedCrawlItem");
  });

  it("keeps import 410 and manual 501", () => {
    const importRoute = readFileSync(
      join(process.cwd(), "app/api/admin/community/crawl/boards/[id]/import/route.ts"),
      "utf8"
    );
    const manualRoute = readFileSync(
      join(process.cwd(), "app/api/admin/community/crawl/boards/[id]/manual/route.ts"),
      "utf8"
    );
    expect(importRoute).toContain("MANUAL_IMPORT_RETIRED");
    expect(importRoute).toContain("status: 410");
    expect(manualRoute).toContain("status: 501");
  });

  it("declares V2 publish target FULL_CONTENT as operational default", () => {
    expect(COMMUNITY_CRAWL_V2_PUBLISH_TARGET).toBe("FULL_CONTENT");
    expect(PUBLISH_TARGET).toBe("FULL_CONTENT");
    expect(COMMUNITY_CRAWL_LEGACY_PUBLISH_MODE).toBe("REFERENCE_SUMMARY");
  });

  it("deletes proven dead prepare/shim/contract files", () => {
    const root = process.cwd();
    for (const rel of [
      "lib/community-crawler/imported-post-admin-contract.ts",
      "lib/community-crawler/prepare-crawl-draft.ts",
      "lib/community-crawler/core/next-data-cover.ts",
    ]) {
      let missing = false;
      try {
        readFileSync(join(root, rel), "utf8");
      } catch {
        missing = true;
      }
      expect(missing).toBe(true);
    }
  });

  it("Travel NEXT_DATA cover authority lives only in travel-philippines adapter (runtime)", () => {
    const adapter = readFileSync(
      join(process.cwd(), "lib/community-crawler/adapters/travel-philippines.ts"),
      "utf8"
    );
    expect(adapter).toContain("TRAVEL_PH_NEXT_DATA_COVER_PATH");
    expect(adapter).toContain("pageProps.data.article");
  });
});
