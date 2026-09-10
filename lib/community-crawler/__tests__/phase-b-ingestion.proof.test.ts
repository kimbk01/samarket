/**
 * PHASE B — ingestion-only live proof (Owner freeze).
 * Closes: title · exact body · cover/body image candidates · identity → durable items
 *          + soft-404 as run_events (NOT item status).
 * Does NOT: rehost · community_post_images · publish · Feed.
 *
 * Run:
 *   COMMUNITY_CRAWL_LIVE_PROOF=1 npx vitest run lib/community-crawler/__tests__/phase-b-ingestion.proof.test.ts
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
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
      const key = line.slice(0, i).trim();
      let v = line.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (key && process.env[key] == null) process.env[key] = v;
    }
  } catch {
    /* ignore */
  }
}

const runLive = process.env.COMMUNITY_CRAWL_LIVE_PROOF === "1";

describe.runIf(runLive)("PHASE B ingestion LIVE proof", () => {
  it(
    "durably stores identity + body + media candidates; soft-404 → run_events only",
    async () => {
      loadEnvLocal();
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
      expect(url && key).toBeTruthy();
      const sb = createClient(url!, key!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      const source = await getCommunityCrawlSource(sb, SOURCE_ID);
      const board = await getCommunityCrawlBoard(sb, BOARD_ID);
      expect(source && board).toBeTruthy();
      expect(source!.policy_status).toBe("REVIEW_REQUIRED");
      expect(source!.media_policy).toBe("MEDIA_REVIEW_REQUIRED");
      expect(board!.ingest_mode).toBe("REVIEW_THEN_PUBLISH");

      const { count: postImagesBefore } = await sb
        .from("community_post_images")
        .select("*", { count: "exact", head: true });

      const result = await runCommunityRealCrawl({
        sb,
        board: board!,
        source: source!,
        runKind: "MANUAL",
        maxPostsOverride: 15,
      });

      expect(result.runId).toBeTruthy();
      expect(result.items.length).toBeGreaterThanOrEqual(10);

      const emptyBody = result.items.filter(
        (it) => !it.source_body_normalized?.trim() || it.source_body_normalized.trim().length < 40
      );
      expect(emptyBody.length).toBe(0);

      for (const it of result.items.slice(0, 10)) {
        expect(it.source_title.trim().length).toBeGreaterThan(3);
        expect(it.source_body_normalized.trim().length).toBeGreaterThan(40);
        expect(it.dibay_title.trim().length).toBeGreaterThan(3);
        expect(it.dibay_body.trim().length).toBeGreaterThan(40);
        expect(Boolean(it.source_post_id) || Boolean(it.canonical_url)).toBe(true);
        expect(Array.isArray(it.source_body_images)).toBe(true);
        if (it.source_cover_url) {
          expect(it.source_cover_url).toMatch(/^https?:\/\//i);
        }
        // Cover candidate may be present even when validated cover is null (PHASE C input).
        if (it.source_cover_candidate_url) {
          expect(it.source_cover_candidate_url).toMatch(/^https?:\/\//i);
        }
        // Soft-404 must not become durable items with SKIPPED_INVALID item status.
        expect(it.status).not.toBe("SKIPPED_INVALID");
      }

      const { data: events, error: evErr } = await sb
        .from("community_crawl_run_events")
        .select("classification,phase,canonical_url,error_code")
        .eq("run_id", result.runId!);
      expect(evErr).toBeNull();
      expect((events ?? []).length).toBeGreaterThan(0);

      const skippedEvents = (events ?? []).filter((e) => e.classification === "SKIPPED_INVALID");
      expect(skippedEvents.length).toBe(result.skippedInvalidCount);

      const withCoverCandidate = result.items.filter((it) => Boolean(it.source_cover_candidate_url));
      // Travel PH currently extracts cover candidates that fail pixel validation → null source_cover_url.
      expect(withCoverCandidate.length + result.skippedInvalidCount).toBeGreaterThan(0);

      if (result.skippedInvalidCount > 0) {
        for (const s of result.skippedInvalid) {
          expect(s.sourceUrl).toBeTruthy();
          const hit = skippedEvents.some((e) => e.canonical_url === s.sourceUrl);
          expect(hit).toBe(true);
        }
      }

      const { count: postImagesAfter } = await sb
        .from("community_post_images")
        .select("*", { count: "exact", head: true });
      expect(postImagesAfter ?? 0).toBe(postImagesBefore ?? 0);

      const artifact = {
        phase: "B",
        runId: result.runId,
        status: result.status,
        items: result.items.length,
        skippedInvalidCount: result.skippedInvalidCount,
        failedCount: result.failedCount,
        events: (events ?? []).length,
        skippedEvents: skippedEvents.length,
        media_policy: source!.media_policy,
        policy_status: source!.policy_status,
        postImagesDelta: (postImagesAfter ?? 0) - (postImagesBefore ?? 0),
        sample: result.items.slice(0, 3).map((it) => ({
          id: it.id,
          source_title: it.source_title.slice(0, 80),
          bodyLen: it.source_body_normalized.length,
          cover: it.source_cover_url,
          coverCandidate: it.source_cover_candidate_url,
          bodyImages: it.source_body_images.length,
          source_post_id: it.source_post_id,
          status: it.status,
        })),
      };
      writeFileSync(
        resolve(process.cwd(), "tests/e2e/.artifacts/community-crawl-phase-b-ingestion.json"),
        JSON.stringify(artifact, null, 2)
      );
    },
    180_000
  );
});
