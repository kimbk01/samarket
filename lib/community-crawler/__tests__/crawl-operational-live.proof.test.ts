/**
 * LIVE operational crawl proof (durable items).
 * Run: npx vitest run lib/community-crawler/__tests__/crawl-operational-live.proof.test.ts
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getCommunityCrawlBoard,
  getCommunityCrawlSource,
} from "@/lib/community-crawler/admin-crawl-store";
import { runCommunityRealCrawl } from "@/lib/community-crawler/core/run-real-crawl";

const SOURCE_ID = "b221b18e-5655-4a48-91e5-ce4ce9d32f2b";
const BOARD_ID = "3ff35075-c7af-46bd-805b-a0cf210223cf";

function loadEnvLocal() {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split(/\n/)) {
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const i = line.indexOf("=");
      const k = line.slice(0, i).trim();
      let v = line.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (k && process.env[k] == null) process.env[k] = v;
    }
  } catch {
    /* ignore */
  }
}

const runLive = process.env.COMMUNITY_CRAWL_LIVE_PROOF === "1";

describe.runIf(runLive)("Community crawl operational LIVE proof", () => {
  it(
    "upserts >=10 durable items with title/body/cover/author/date/view",
    async () => {
      loadEnvLocal();
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
      expect(url && key).toBeTruthy();
      const sb = createClient(url!, key!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      const pool = [
        "마닐라생활",
        "세부한달살기",
        "필리핀여행자",
        "보라카이노트",
        "클락생활정보",
        "팔라완여행",
        "세부맛집탐방",
        "마닐라가이드",
        "필핀여행노트",
        "현지생활톡",
      ].map((display_name) => ({ display_name }));
      const now = Date.now();
      await sb
        .from("community_crawl_sources")
        .update({ adapter_key: "travel_philippines", crawler_type: "custom_adapter" })
        .eq("id", SOURCE_ID);
      await sb
        .from("community_crawl_boards")
        .update({
          crawl_mode: "custom_adapter",
          author_policy: "RANDOM_POOL",
          author_config: { random_pool: pool },
          date_policy: "RANDOM_RANGE",
          date_config: {
            random_min: new Date(now - 30 * 86400000).toISOString(),
            random_max: new Date(now).toISOString(),
          },
          view_policy: "RANDOM_RANGE",
          view_config: { random_min: 12, random_max: 480 },
          ingest_mode: "REVIEW_THEN_PUBLISH",
          max_posts: 15,
          enabled: true,
        })
        .eq("id", BOARD_ID);

      const board = await getCommunityCrawlBoard(sb, BOARD_ID);
      const source = await getCommunityCrawlSource(sb, SOURCE_ID);
      expect(board && source).toBeTruthy();

      const result = await runCommunityRealCrawl({
        sb,
        board: board!,
        source: source!,
        runKind: "MANUAL",
        maxPostsOverride: 15,
      });

      expect(result.items.length).toBeGreaterThanOrEqual(10);
      for (const it of result.items.slice(0, 10)) {
        expect(it.dibay_title.length).toBeGreaterThan(3);
        expect(it.dibay_body.length).toBeGreaterThan(40);
        // Cover URL PRESENT ≠ COVER VALID — dead assets must persist as null.
        if (it.source_cover_url) {
          expect(it.source_cover_url).toMatch(/^https?:\/\//i);
        }
        expect(it.display_author_name).toBeTruthy();
        expect(it.display_author_name).not.toMatch(/travel philippines/i);
        expect(it.display_author_name).not.toBe("예시 작성자");
        expect(it.display_date).toBeTruthy();
        expect(it.display_view_seed).toBeGreaterThanOrEqual(12);
        // manual_override may retain an edited view seed outside board random range.
        if (!it.manual_override) {
          expect(it.display_view_seed).toBeLessThanOrEqual(480);
        }
      }

      const again = await runCommunityRealCrawl({
        sb,
        board: board!,
        source: source!,
        runKind: "MANUAL",
        maxPostsOverride: 15,
      });
      // Previously-failed detail may succeed on retry (≤1). Mass re-insert must not happen.
      expect(again.insertedCount).toBeLessThanOrEqual(1);
      expect(again.duplicateCount + again.updatedCount).toBeGreaterThanOrEqual(8);

      const { count } = await sb
        .from("community_crawl_items")
        .select("*", { count: "exact", head: true })
        .eq("board_id", BOARD_ID);
      expect((count ?? 0) >= 10).toBe(true);
    },
    180_000
  );
});
