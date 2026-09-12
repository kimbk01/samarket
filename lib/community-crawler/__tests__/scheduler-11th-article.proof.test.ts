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

describe("DIBAY COMMUNITY CRAWLER — SCHEDULER 11TH ARTICLE AUTO TEST", () => {
  it("detects 11th article via SCHEDULED run, rehosts media, and auto-publishes without admin click", async () => {
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

    const boards = await listCommunityCrawlBoards(sb, source!.id);
    const board = boards.find((b) => b.name === "필리핀 정착/생활 가이드");
    expect(board).toBeDefined();

    // Set next_run_at to past to simulate scheduled execution
    await sb
      .from("community_crawl_boards")
      .update({ next_run_at: new Date(Date.now() - 60_000).toISOString() })
      .eq("id", board!.id);

    console.log("Simulating SCHEDULED run for positive board...");
    const result = await runCommunityCrawlBoard({
      sb,
      board: board!,
      source: source!,
      runKind: "SCHEDULED",
    });

    console.log("SCHEDULED run result:", {
      status: result.status,
      fetched: result.fetchedCount,
      inserted: result.insertedCount,
      duplicate: result.duplicateCount,
      published: result.publishedCount,
    });

    expect(result.status).toBe("SUCCESS");
    expect(result.fetchedCount).toBe(11);
    expect(result.insertedCount).toBe(1);
    expect(result.duplicateCount).toBe(10);
    expect(result.publishedCount).toBe(1);

    // 2. Verify total 11 items now exist in DB and are published
    const { data: allItems } = await sb
      .from("community_crawl_items")
      .select("*")
      .eq("board_id", board!.id)
      .order("created_at", { ascending: true });

    expect(allItems?.length).toBe(11);

    // Verify 11th article community post and images
    const item11 = allItems!.find((it) => it.canonical_url.includes("article-11.html"));
    expect(item11).toBeDefined();
    expect(item11!.status).toBe("PUBLISHED");

    const { data: link11 } = await sb
      .from("community_crawl_post_links")
      .select("*")
      .eq("canonical_url", item11!.canonical_url)
      .maybeSingle();
    expect(link11).toBeDefined();
    expect(link11!.community_post_id).toBeTruthy();

    const { data: post11 } = await sb
      .from("community_posts")
      .select("*")
      .eq("id", link11!.community_post_id)
      .single();
    expect(post11.status).toBe("active");
    expect(post11.title).toContain("은퇴 비자");

    const { data: images11 } = await sb
      .from("community_post_images")
      .select("*")
      .eq("post_id", post11.id)
      .order("sort_order", { ascending: true });
    expect(images11?.length).toBe(2); // cover + body

    // Pixel check for 11th article
    const firstImg = images11![0].image_url;
    const r = await fetch(firstImg);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("image");

    console.log("11TH ARTICLE AUTO PUBLISHED SUCCESSFULLY VIA SCHEDULED RUN!");
  }, 120_000);
});
