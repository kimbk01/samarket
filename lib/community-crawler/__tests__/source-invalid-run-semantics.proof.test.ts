/**
 * SOURCE_INVALID run semantics live proof (Travel PH).
 * Usage:
 *   COMMUNITY_CRAWL_SOURCE_INVALID_PROOF=1 npx vitest run \
 *     lib/community-crawler/__tests__/source-invalid-run-semantics.proof.test.ts
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getCommunityCrawlBoard,
  getCommunityCrawlSource,
  listCommunityCrawlRuns,
} from "@/lib/community-crawler/admin-crawl-store";
import { runCommunityRealCrawl } from "@/lib/community-crawler/core/run-real-crawl";

const BOARD_ID = "3ff35075-c7af-46bd-805b-a0cf210223cf";
const runProof = process.env.COMMUNITY_CRAWL_SOURCE_INVALID_PROOF === "1";

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

describe.runIf(runProof)("SOURCE_INVALID run semantics", () => {
  it(
    "counts soft-404 as skipped_invalid, not failed; SUCCESS when no real failures",
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

      const beforeItems = await sb
        .from("community_crawl_items")
        .select("id", { count: "exact", head: true })
        .eq("board_id", BOARD_ID);
      const itemCountBefore = beforeItems.count ?? 0;

      const result = await runCommunityRealCrawl({
        sb,
        board: board!,
        source: source!,
        runKind: "MANUAL",
        maxPostsOverride: 15,
      });

      const afterItems = await sb
        .from("community_crawl_items")
        .select("id", { count: "exact", head: true })
        .eq("board_id", BOARD_ID);
      const itemCountAfter = afterItems.count ?? 0;

      const runs = await listCommunityCrawlRuns(sb, { boardId: BOARD_ID, limit: 3 });
      const persisted = runs.find((r) => r.id === result.runId) ?? runs[0];

      const artifact = {
        status: result.status,
        runId: result.runId,
        inserted: result.insertedCount,
        updated: result.updatedCount,
        duplicate: result.duplicateCount,
        skipped_invalid: result.skippedInvalidCount,
        failed: result.failedCount,
        items_before: itemCountBefore,
        items_after: itemCountAfter,
        skipped_urls: result.skippedInvalid.map((s) => s.sourceUrl),
        persisted_run: persisted
          ? {
              id: persisted.id,
              status: persisted.status,
              skipped_invalid_count: persisted.skipped_invalid_count,
              failed_count: persisted.failed_count,
              duplicate_count: persisted.duplicate_count,
            }
          : null,
      };
      mkdirSync(resolve(process.cwd(), "tests/e2e/.artifacts"), { recursive: true });
      writeFileSync(
        resolve(process.cwd(), "tests/e2e/.artifacts/community-crawl-source-invalid-semantics.json"),
        JSON.stringify(artifact, null, 2)
      );

      expect(result.failedCount).toBe(0);
      expect(result.skippedInvalidCount).toBeGreaterThanOrEqual(4);
      expect(result.duplicateCount + result.updatedCount + result.insertedCount).toBeGreaterThanOrEqual(11);
      expect(result.status).toBe("SUCCESS");
      expect(itemCountAfter).toBe(itemCountBefore);
      expect(persisted?.skipped_invalid_count).toBe(result.skippedInvalidCount);
      expect(persisted?.failed_count).toBe(0);
      expect(persisted?.status).toBe("SUCCESS");
    },
    180_000
  );
});
