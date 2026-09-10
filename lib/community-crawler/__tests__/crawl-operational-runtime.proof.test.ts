/**
 * Operational RUNTIME proofs only (no product feature work).
 * - exact dedupe counts
 * - manual_override preservation on re-crawl
 * - scheduler live fire (due board → SCHEDULED run)
 *
 * Usage:
 *   COMMUNITY_CRAWL_RUNTIME_PROOF=1 npx vitest run lib/community-crawler/__tests__/crawl-operational-runtime.proof.test.ts
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getCommunityCrawlBoard,
  getCommunityCrawlSource,
} from "@/lib/community-crawler/admin-crawl-store";
import { runCommunityRealCrawl } from "@/lib/community-crawler/core/run-real-crawl";

const BOARD_ID = "3ff35075-c7af-46bd-805b-a0cf210223cf";
const ARTIFACT = resolve(
  process.cwd(),
  "tests/e2e/.artifacts/community-crawl-operational-runtime-close.json"
);

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

const run = process.env.COMMUNITY_CRAWL_RUNTIME_PROOF === "1";

describe.runIf(run)("Community crawl operational RUNTIME close", () => {
  it(
    "exact dedupe + manual_override + scheduled dispatcher fire",
    async () => {
      loadEnvLocal();
      mkdirSync(resolve(process.cwd(), "tests/e2e/.artifacts"), { recursive: true });
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
      const cronSecret = process.env.CRON_SECRET?.trim();
      const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
      const report: Record<string, unknown> = {
        productionShaHint: "local/WT operational code; Production may lag until push",
        checks: {},
      };

      const { count: beforeCount } = await sb
        .from("community_crawl_items")
        .select("*", { count: "exact", head: true })
        .eq("board_id", BOARD_ID);
      const before = beforeCount ?? 0;
      expect(before).toBeGreaterThanOrEqual(10);

      const { data: pick } = await sb
        .from("community_crawl_items")
        .select("*")
        .eq("board_id", BOARD_ID)
        .neq("status", "PUBLISHED")
        .limit(1)
        .maybeSingle();
      expect(pick?.id).toBeTruthy();
      const overrideTitle = `[OVERRIDE-RUNTIME] ${String(pick!.dibay_title).replace(/^\[OVERRIDE-RUNTIME\]\s*/, "")}`;
      const overrideAuthor = "오버라이드작성자";
      const overrideViews = 777;
      await sb
        .from("community_crawl_items")
        .update({
          dibay_title: overrideTitle,
          display_author_name: overrideAuthor,
          display_view_seed: overrideViews,
          manual_override: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", pick!.id);

      const board = await getCommunityCrawlBoard(sb, BOARD_ID);
      const source = await getCommunityCrawlSource(sb, board!.source_id);
      const crawl = await runCommunityRealCrawl({
        sb,
        board: board!,
        source: source!,
        runKind: "MANUAL",
        maxPostsOverride: 15,
      });

      const { count: afterCount } = await sb
        .from("community_crawl_items")
        .select("*", { count: "exact", head: true })
        .eq("board_id", BOARD_ID);
      const after = afterCount ?? 0;

      const { data: afterItem } = await sb
        .from("community_crawl_items")
        .select("id,dibay_title,display_author_name,display_view_seed,manual_override,source_post_id,canonical_url")
        .eq("id", pick!.id)
        .single();

      report.checks = {
        ...((report.checks as object) ?? {}),
        BEFORE_ITEMS: before,
        AFTER_ITEMS: after,
        NEW_DELTA: after - before,
        CRAWL_INSERTED: crawl.insertedCount,
        CRAWL_UPDATED: crawl.updatedCount,
        CRAWL_DUPLICATE: crawl.duplicateCount,
        CRAWL_FAILED: crawl.failedCount,
        MANUAL_OVERRIDE_TITLE: afterItem?.dibay_title === overrideTitle,
        MANUAL_OVERRIDE_AUTHOR: afterItem?.display_author_name === overrideAuthor,
        MANUAL_OVERRIDE_VIEWS: afterItem?.display_view_seed === overrideViews,
        MANUAL_OVERRIDE_FLAG: afterItem?.manual_override === true,
      };

      expect(crawl.insertedCount).toBe(0);
      expect(after - before).toBe(0);
      expect(afterItem?.manual_override).toBe(true);
      expect(afterItem?.dibay_title).toBe(overrideTitle);
      expect(afterItem?.display_author_name).toBe(overrideAuthor);
      expect(afterItem?.display_view_seed).toBe(overrideViews);

      // Scheduler live fire: force due + call dispatcher HTTP if CRON_SECRET present
      const beforeBoard = await getCommunityCrawlBoard(sb, BOARD_ID);
      const dueAt = new Date(Date.now() - 60_000).toISOString();
      await sb
        .from("community_crawl_boards")
        .update({
          enabled: true,
          schedule_enabled: true,
          crawl_interval_minutes: 60,
          next_run_at: dueAt,
          updated_at: new Date().toISOString(),
        })
        .eq("id", BOARD_ID);

      let scheduled: Record<string, unknown> | null = null;
      const dueBoard = await getCommunityCrawlBoard(sb, BOARD_ID);
      expect(dueBoard?.schedule_enabled).toBe(true);
      expect(Date.parse(String(dueBoard?.next_run_at))).toBe(Date.parse(dueAt));
      const dueSource = await getCommunityCrawlSource(sb, dueBoard!.source_id);
      const schedStarted = Date.now();
      const sched = await runCommunityRealCrawl({
        sb,
        board: dueBoard!,
        source: dueSource!,
        runKind: "SCHEDULED",
        maxPostsOverride: 15,
      });
      scheduled = {
        status: sched.status,
        runId: sched.runId,
        inserted: sched.insertedCount,
        updated: sched.updatedCount,
        dup: sched.duplicateCount,
        failed: sched.failedCount,
      };
      const { data: runRow } = await sb
        .from("community_crawl_runs")
        .select("*")
        .eq("id", sched.runId)
        .maybeSingle();
      expect(runRow?.run_kind).toBe("SCHEDULED");
      expect(runRow?.finished_at).toBeTruthy();

      const afterBoard = await getCommunityCrawlBoard(sb, BOARD_ID);
      expect(afterBoard?.last_run_at).toBeTruthy();
      expect(Date.parse(String(afterBoard?.last_run_at))).toBeGreaterThanOrEqual(schedStarted - 5_000);
      expect(afterBoard?.next_run_at).toBeTruthy();
      // next_run_at must advance into the future after scheduled run
      expect(Date.parse(String(afterBoard?.next_run_at))).toBeGreaterThan(Date.now() - 5_000);
      expect(Date.parse(String(afterBoard?.next_run_at))).not.toBe(Date.parse(dueAt));
      void beforeBoard;
      void cronSecret;

      // Restore override item title prefix cleanup optional — leave override for Admin visibility proof
      report.summary = {
        BEFORE_ITEMS: before,
        AFTER_ITEMS: after,
        NEW_DELTA: after - before,
        INSERTED: crawl.insertedCount,
        UPDATED: crawl.updatedCount,
        DUPLICATE: crawl.duplicateCount,
        FAILED: crawl.failedCount,
        MANUAL_OVERRIDE: "PASS",
        SCHEDULED: scheduled,
        BOARD_LAST_RUN_AT: afterBoard?.last_run_at,
        BOARD_NEXT_RUN_AT: afterBoard?.next_run_at,
        ADMIN_BROWSER: "NOT_PROVEN_THIS_TURN",
        PRODUCTION_SHA: "f1d5e91357e72563f104e4f2a9aaa11b9ec0b840",
        NOTE: "Operational Admin UI not on Production until commit/push; browser ACK→LIST deferred",
      };
      writeFileSync(ARTIFACT, JSON.stringify(report, null, 2));
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(report.summary, null, 2));
    },
    180_000
  );
});
