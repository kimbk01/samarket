/**
 * Live TEST crawl must succeed for Travel PH See & Do (custom_adapter).
 * Usage:
 *   COMMUNITY_CRAWL_TEST_TRAVEL_PROOF=1 npx vitest run \
 *     lib/community-crawler/__tests__/test-crawl-travel-ph.proof.test.ts
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getCommunityCrawlBoard,
  getCommunityCrawlSource,
} from "@/lib/community-crawler/admin-crawl-store";
import { runCommunityTestCrawl } from "@/lib/community-crawler/core/run-test-crawl";

const BOARD_ID = "3ff35075-c7af-46bd-805b-a0cf210223cf";
const runProof = process.env.COMMUNITY_CRAWL_TEST_TRAVEL_PROOF === "1";

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

describe.runIf(runProof)("TEST crawl Travel PH See & Do", () => {
  it(
    "does not return ADAPTER_UNSUPPORTED; returns SUCCESS with previews",
    async () => {
      loadEnvLocal();
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
      expect(url && key).toBeTruthy();
      const sb = createClient(url!, key!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const board = await getCommunityCrawlBoard(sb, BOARD_ID);
      expect(board).toBeTruthy();
      const source = await getCommunityCrawlSource(sb, board!.source_id);
      expect(source).toBeTruthy();
      expect(source!.adapter_key).toBe("travel_philippines");
      expect(board!.crawl_mode).toBe("custom_adapter");

      const result = await runCommunityTestCrawl({
        sb,
        board: board!,
        source: source!,
        topicName: "여행정보",
        recordRun: true,
        maxPostsOverride: 5,
      });

      const artifact = {
        status: result.status,
        successCount: result.successCount,
        failedCount: result.failedCount,
        skippedInvalidCount: result.skippedInvalidCount,
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
        failureCodes: result.failures.map((f) => f.errorCode),
        previewTitles: result.previews.map((p) => p.title).slice(0, 5),
      };
      mkdirSync(resolve(process.cwd(), "tests/e2e/.artifacts"), { recursive: true });
      writeFileSync(
        resolve(process.cwd(), "tests/e2e/.artifacts/community-crawl-test-travel-ph.json"),
        JSON.stringify(artifact, null, 2)
      );

      expect(result.errorCode).not.toBe("ADAPTER_UNSUPPORTED");
      expect(result.failures.every((f) => f.errorCode !== "ADAPTER_UNSUPPORTED")).toBe(true);
      expect(result.successCount).toBeGreaterThanOrEqual(1);
      expect(result.status).toMatch(/SUCCESS|PARTIAL/);
      expect(result.previews[0]?.title?.trim().length).toBeGreaterThan(0);
      expect(result.previews[0]?.contentMarkdown?.trim().length).toBeGreaterThan(20);
    },
    120_000
  );
});
