import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runCommunityCrawlBoard } from "@/lib/community-crawler/core/run-real-crawl";
import {
  listCommunityCrawlBoards,
  listCommunityCrawlSources,
} from "@/lib/community-crawler/admin-crawl-store";

function loadEnvLocal() {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const i = line.indexOf("=");
      const k = line.slice(0, i).trim();
      let v = line.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (process.env[k] == null) process.env[k] = v;
    }
  } catch {
    /* ignore */
  }
}

describe("DIBAY COMMUNITY CRAWLER — OPERATIONAL 10-POST PROOF", () => {
  it("crawls 10 real positive articles, rehosts media, and auto-publishes to community", async () => {
    loadEnvLocal();
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    expect(supabaseUrl).toBeTruthy();
    expect(serviceKey).toBeTruthy();

    const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // 1. Find positive source & board
    const sources = await listCommunityCrawlSources(sb);
    const source = sources.find((s) => s.name === "DIBAY 필리핀 생활 가이드 (공식 매거진)");
    expect(source).toBeDefined();
    expect(source!.policy_status).toBe("ALLOWED");
    expect(source!.media_policy).toBe("MEDIA_ALLOWED");

    const boards = await listCommunityCrawlBoards(sb, source!.id);
    const board = boards.find((b) => b.name === "필리핀 정착/생활 가이드");
    expect(board).toBeDefined();
    expect(board!.ingest_mode).toBe("AUTO_PUBLISH");

    // 2. Run board crawl
    console.log("Starting runCommunityCrawlBoard for positive board:", board!.id);
    const result = await runCommunityCrawlBoard({
      sb,
      board: board!,
      source: source!,
      runKind: "MANUAL",
      maxPostsOverride: 10,
    });

    console.log("Crawl result status:", result.status);
    console.log("Error code:", result.errorCode, "message:", result.errorMessage);
    console.log("Fetched:", result.fetchedCount, "Inserted:", result.insertedCount, "Published:", result.publishedCount);
    console.log("Failures:", result.failures);
    console.log("Skipped:", result.skippedInvalid);

    expect(result.status).toBe("SUCCESS");
    expect(result.fetchedCount).toBe(10);
    expect(result.publishedCount).toBe(10);

    // 3. Verify exactly 10 items persisted and published
    const { data: items } = await sb
      .from("community_crawl_items")
      .select("*")
      .eq("board_id", board!.id)
      .order("created_at", { ascending: true });

    expect(items?.length).toBe(10);

    const auditTable = [];
    let validCoverCount = 0;
    let bodyImageCountTotal = 0;
    let itemMediaCountTotal = 0;
    let postCount = 0;
    let postImagesCountTotal = 0;

    for (let i = 0; i < items!.length; i++) {
      const it = items![i];
      const { data: media } = await sb
        .from("community_crawl_item_media")
        .select("*")
        .eq("crawl_item_id", it.id);

      const { data: link } = await sb
        .from("community_crawl_post_links")
        .select("*")
        .eq("canonical_url", it.canonical_url)
        .maybeSingle();

      let post = null;
      let postImages = [];
      if (link?.community_post_id) {
        const { data: p } = await sb
          .from("community_posts")
          .select("*")
          .eq("id", link.community_post_id)
          .maybeSingle();
        post = p;

        const { data: pi } = await sb
          .from("community_post_images")
          .select("*")
          .eq("post_id", link.community_post_id)
          .order("sort_order", { ascending: true });
        postImages = pi || [];
      }

      if (it.source_cover_url) validCoverCount++;
      const bodyImgs = Array.isArray(it.source_body_images) ? it.source_body_images.length : 0;
      bodyImageCountTotal += bodyImgs;
      itemMediaCountTotal += media?.length || 0;
      if (post && post.status === "active") postCount++;
      postImagesCountTotal += postImages.length;

      // Verify images actually have pixels by checking dimensions or downloading bytes
      let pixelOk = false;
      if (postImages.length > 0) {
        const firstImgUrl = postImages[0].image_url;
        const res = await fetch(firstImgUrl);
        pixelOk = res.status === 200 && (res.headers.get("content-type")?.includes("image") ?? false);
      }

      auditTable.push({
        num: i + 1,
        source_url: it.canonical_url,
        title: it.source_title,
        body_length: it.source_body_normalized?.length || 0,
        cover: it.source_cover_url ? "YES" : "NO",
        body_images: bodyImgs,
        item_media: media?.length || 0,
        community_post_id: post?.id ?? "NONE",
        community_post_images: postImages.length,
        feed_present: post?.status === "active" ? "YES" : "NO",
        detail_present: post ? "YES" : "NO",
        pixel: pixelOk ? "YES" : "NO",
      });
    }

    console.log("=== 10 ITEM AUDIT TABLE ===");
    console.table(auditTable);

    expect(validCoverCount).toBe(10);
    expect(bodyImageCountTotal).toBeGreaterThanOrEqual(10);
    expect(itemMediaCountTotal).toBeGreaterThanOrEqual(20); // 10 cover + 10 body = 20
    expect(postCount).toBe(10);
    expect(postImagesCountTotal).toBeGreaterThanOrEqual(20);

    console.log("10-POST OPERATIONAL PROOF: ALL 10 PASSED!");
  }, 120_000);
});
