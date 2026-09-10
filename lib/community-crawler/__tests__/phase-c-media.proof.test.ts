/**
 * PHASE C live proofs:
 * - Travel PH MEDIA_REVIEW_REQUIRED → rehost delta 0
 * - No authorized MEDIA_ALLOWED QA source flip
 *
 * Run: COMMUNITY_CRAWL_LIVE_PROOF=1 npx vitest run lib/community-crawler/__tests__/phase-c-media.proof.test.ts
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getCommunityCrawlBoard,
  getCommunityCrawlSource,
} from "@/lib/community-crawler/admin-crawl-store";
import { listCommunityCrawlItems } from "@/lib/community-crawler/crawl-item-store";
import { rehostCommunityCrawlItemMedia } from "@/lib/community-crawler/media/rehost-item-media";

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

describe.runIf(runLive)("PHASE C media LIVE proof", () => {
  it(
    "Travel PH MEDIA_REVIEW_REQUIRED → rehost delta 0; post_images unchanged",
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
      expect(source?.media_policy).toBe("MEDIA_REVIEW_REQUIRED");
      expect(board).toBeTruthy();

      const { count: mediaBefore } = await sb
        .from("community_crawl_item_media")
        .select("*", { count: "exact", head: true });
      const { count: postImagesBefore } = await sb
        .from("community_post_images")
        .select("*", { count: "exact", head: true });

      const items = await listCommunityCrawlItems(sb, { boardId: BOARD_ID, limit: 15 });
      expect(items.length).toBeGreaterThan(0);

      let uploaded = 0;
      let attempted = 0;
      for (const it of items.slice(0, 11)) {
        const stats = await rehostCommunityCrawlItemMedia({ sb, item: it, source: source! });
        expect(stats.skippedPolicy).toBe(true);
        uploaded += stats.uploaded;
        attempted += stats.attempted;
      }

      const { count: mediaAfter } = await sb
        .from("community_crawl_item_media")
        .select("*", { count: "exact", head: true });
      const { count: postImagesAfter } = await sb
        .from("community_post_images")
        .select("*", { count: "exact", head: true });

      const { count: allowedSources } = await sb
        .from("community_crawl_sources")
        .select("*", { count: "exact", head: true })
        .eq("media_policy", "MEDIA_ALLOWED");

      const artifact = {
        phase: "C",
        travelPhMediaPolicy: source!.media_policy,
        travelPhRehostUploaded: uploaded,
        travelPhRehostAttempted: attempted,
        crawlItemMediaDelta: (mediaAfter ?? 0) - (mediaBefore ?? 0),
        communityPostImagesDelta: (postImagesAfter ?? 0) - (postImagesBefore ?? 0),
        authorizedMediaAllowedSourceCount: allowedSources ?? 0,
      };
      writeFileSync(
        resolve(process.cwd(), "tests/e2e/.artifacts/community-crawl-phase-c-media.json"),
        JSON.stringify(artifact, null, 2)
      );

      expect(uploaded).toBe(0);
      expect(attempted).toBe(0);
      expect(artifact.crawlItemMediaDelta).toBe(0);
      expect(artifact.communityPostImagesDelta).toBe(0);
    },
    60_000
  );
});
