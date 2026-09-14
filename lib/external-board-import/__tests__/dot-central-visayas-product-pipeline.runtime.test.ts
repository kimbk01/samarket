/**
 * DOT Central Visayas product pipeline (library path used by Admin APIs).
 * Admin HTTP/UI session is separate — this proves Discover→Publish→DB only.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { findCatalogSection } from "@/lib/external-board-import/catalog/source-catalog";
import { discoverExternalBoardArticles } from "@/lib/external-board-import/discovery/article-discovery";
import { listWriteEligibleTopicsForExternalImport } from "@/lib/external-board-import/mapping/assert-write-eligible-topic";
import { publishExternalBoardArticleCanonical } from "@/lib/external-board-import/publish/canonical-publisher";
import {
  createExternalBoardSource,
  ExternalBoardSourceDuplicateError,
  getExternalBoardSource,
  listExternalBoardSources,
  patchExternalBoardSource,
} from "@/lib/external-board-import/registry/source-board-store";

const DOT_URL = "https://www.tourism.gov.ph/destination/central-visayas/";

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

describe("DOT Central Visayas product pipeline runtime", () => {
  it("catalog → register → discover → select 1 → publish → community_posts +1", async () => {
    const env = loadEnvLocal();
    const url = env.NEXT_PUBLIC_SUPABASE_URL;
    const key = env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      console.warn("SKIP: no service credentials");
      return;
    }
    const catalog = findCatalogSection("dot-central-visayas");
    expect(catalog?.section.status).toBe("available");
    expect(catalog?.section.sectionUrl).toBe(DOT_URL);

    const sb = createClient(url, key, { auth: { persistSession: false } });
    const topics = await listWriteEligibleTopicsForExternalImport(sb);
    expect(topics.length).toBeGreaterThan(0);
    const topic = topics.find((t) => /travel|여행/i.test(`${t.slug} ${t.name}`)) ?? topics[0]!;

    let source;
    try {
      source = await createExternalBoardSource(sb, {
        sourceUrl: DOT_URL,
        sourceBoardName: "Department of Tourism · Central Visayas",
        siteName: "Department of Tourism",
        targetTopicId: topic.id,
        targetTopicSlug: topic.slug,
        rightsBasis: "Official public destination content — Department of Tourism",
        rightsStatus: "declared",
        enabled: true,
      });
    } catch (e) {
      if (e instanceof ExternalBoardSourceDuplicateError) {
        source = e.existingSource;
        if (source.rights_status !== "declared" || !source.rights_basis || !source.target_topic_id) {
          source = await patchExternalBoardSource(sb, source.id, {
            rightsBasis: "Official public destination content — Department of Tourism",
            rightsStatus: "declared",
            targetTopicId: topic.id,
            targetTopicSlug: topic.slug,
            enabled: true,
          });
        }
      } else {
        throw e;
      }
    }
    expect(source.target_topic_id).toBeTruthy();
    expect(source.rights_status).toBe("declared");

    const discovered = await discoverExternalBoardArticles(sb, source, {
      limit: 5,
      pageFrom: 1,
      pageTo: 1,
    });
    expect(discovered.summary.discovered).toBeGreaterThanOrEqual(3);
    const unpublished = discovered.upserted.filter((a) => !a.published_post_id);
    expect(unpublished.length).toBeGreaterThan(0);
    const article = unpublished[0]!;

    const restTitle = article.source_title;
    const restDate = article.source_published_at;
    const restImages = (article.source_document.nodes || []).filter((n) => n.type === "image").length;
    const restBodyParas = (article.source_document.nodes || []).filter((n) => n.type === "paragraph").length;

    const beforePosts = await sb.from("community_posts").select("id", { count: "exact", head: true });
    const beforeCount = beforePosts.count ?? 0;

    const fresh = await getExternalBoardSource(sb, source.id);
    expect(fresh).toBeTruthy();
    const pub = await publishExternalBoardArticleCanonical(sb, fresh!, article.id);
    expect(pub.ok).toBe(true);
    if (!pub.ok) throw new Error(JSON.stringify(pub));

    const afterPosts = await sb.from("community_posts").select("id", { count: "exact", head: true });
    expect(afterPosts.count).toBe(beforeCount + 1);

    const { data: post } = await sb
      .from("community_posts")
      .select("id, title, topic_id, published_at, origin_kind")
      .eq("id", pub.postId)
      .single();
    expect(post?.origin_kind).toBe("imported");
    expect(post?.topic_id).toBe(source.target_topic_id || topic.id);

    const { count: imgCount } = await sb
      .from("community_post_images")
      .select("id", { count: "exact", head: true })
      .eq("post_id", pub.postId);

    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        SOURCE: "Department of Tourism",
        SECTION: "Central Visayas",
        DIBAY_TOPIC: topic.slug,
        DISCOVER_COUNT: discovered.summary.discovered,
        SELECTED_ID: article.id,
        REST_TITLE: restTitle,
        REST_DATE: restDate,
        REST_BODY_PARAS: restBodyParas,
        REST_IMAGE_COUNT: restImages,
        PUBLISHED_POST: post,
        IMAGE_COUNT: imgCount ?? 0,
        DB_BEFORE: beforeCount,
        DB_AFTER: afterPosts.count,
        DELTA: 1,
      })
    );

    // sanity: sources list still includes this DOT board
    const all = await listExternalBoardSources(sb);
    expect(all.some((s) => s.id === source.id)).toBe(true);
  }, 120_000);
});
