/**
 * Operational crawl runner — invoked by community-crawl-operational-proof.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { runCommunityRealCrawl } from "../../lib/community-crawler/core/run-real-crawl.ts";
import {
  getCommunityCrawlBoard,
  getCommunityCrawlSource,
} from "../../lib/community-crawler/admin-crawl-store.ts";

const BOARD_ID = process.env.BOARD_ID || "3ff35075-c7af-46bd-805b-a0cf210223cf";

async function main() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const board = await getCommunityCrawlBoard(sb, BOARD_ID);
  if (!board) throw new Error("board_not_found");
  const source = await getCommunityCrawlSource(sb, board.source_id);
  if (!source) throw new Error("source_not_found");
  const result = await runCommunityRealCrawl({
    sb,
    board,
    source,
    runKind: "MANUAL",
    maxPostsOverride: 15,
  });
  console.log(
    JSON.stringify({
      status: result.status,
      runId: result.runId,
      inserted: result.insertedCount,
      updated: result.updatedCount,
      dup: result.duplicateCount,
      skippedInvalid: result.skippedInvalidCount,
      failed: result.failedCount,
      items: result.items.length,
      failures: result.failures.slice(0, 5),
      skipped: result.skippedInvalid.slice(0, 8),
      sample: result.items.slice(0, 3).map((i) => ({
        title: i.dibay_title,
        author: i.display_author_name,
        cover: Boolean(i.source_cover_url),
        bodyLen: i.dibay_body.length,
        views: i.display_view_seed,
        date: i.display_date,
      })),
    })
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
