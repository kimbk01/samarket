/**
 * Runtime proof: pending Wikivoyage article must not create community_posts.
 * Uses linked Production DB credentials from .env.local (service role).
 * Skips if env missing (CI without secrets).
 */
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { boardImportCanonicalPublisher } from "@/lib/community-board-import/transform-publish";
import {
  BOARD_IMPORT_SOURCE_BLOCKED_CODE,
  isBoardImportSourceBlocked,
} from "@/lib/community-board-import/blocked-sources";

const SRC = "53b6b238-74c9-49b3-92fe-78d703faca4f";

function loadEnvLocal(): Record<string, string> {
  const p = join(process.cwd(), ".env.local");
  if (!existsSync(p)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

describe("Wikivoyage pending publish block (runtime)", () => {
  it("publisher rejects pending article without community_posts delta", async () => {
    const env = loadEnvLocal();
    const url = env.NEXT_PUBLIC_SUPABASE_URL;
    const key = env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      console.warn("SKIP: no .env.local service credentials");
      return;
    }
    const sb = createClient(url, key, { auth: { persistSession: false } });

    const { data: source, error: sErr } = await sb
      .from("board_import_sources")
      .select("id, mode, target_topic_id, site_key, source_url")
      .eq("id", SRC)
      .single();
    expect(sErr).toBeNull();
    expect(source?.mode).toBe("MANUAL");
    expect(source?.target_topic_id).toBeNull();
    expect(
      isBoardImportSourceBlocked({
        id: source!.id,
        siteKey: source!.site_key,
        sourceUrl: source!.source_url,
      })
    ).toBe(true);

    const { data: pending, error: pErr } = await sb
      .from("board_import_articles")
      .select("id")
      .eq("source_board_id", SRC)
      .is("published_post_id", null)
      .limit(1);
    expect(pErr).toBeNull();
    expect(pending?.length).toBeGreaterThan(0);
    const articleId = pending![0].id as string;

    const before = await sb.from("community_posts").select("id", { count: "exact", head: true });
    const result = await boardImportCanonicalPublisher.publish({ sb, articleId });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect([BOARD_IMPORT_SOURCE_BLOCKED_CODE, "target_missing"]).toContain(result.failure_code);
    }
    const after = await sb.from("community_posts").select("id", { count: "exact", head: true });
    expect(after.count).toBe(before.count);

    const { data: art } = await sb
      .from("board_import_articles")
      .select("published_post_id, failure_code")
      .eq("id", articleId)
      .single();
    expect(art?.published_post_id).toBeNull();
  }, 60_000);
});
