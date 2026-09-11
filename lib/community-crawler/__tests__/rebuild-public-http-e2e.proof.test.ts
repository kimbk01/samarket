/**
 * PUBLIC HTTP AUTO E2E — crawler rebuild product proof.
 * Run:
 *   COMMUNITY_CRAWL_REBUILD_E2E=1 npx vitest run lib/community-crawler/__tests__/rebuild-public-http-e2e.proof.test.ts
 */
import sharp from "sharp";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getCommunityCrawlBoard,
  getCommunityCrawlSource,
} from "@/lib/community-crawler/admin-crawl-store";
import { runCommunityCrawlBoard } from "@/lib/community-crawler/core/run-real-crawl";

const FIXTURE_PREFIX = "crawl-qa-fixtures/rebuild-e2e";
const SOURCE_NAME = "DIBAY QA Crawl Fixture (rebuild)";
const BOARD_NAME = "QA AUTO board";
const TOPIC_SLUG = "travel";
const TRAVEL_PH_SOURCE_ID = "b221b18e-5655-4a48-91e5-ce4ce9d32f2b";

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

async function upload(
  sb: SupabaseClient,
  path: string,
  body: Buffer,
  contentType: string
): Promise<string> {
  const { error } = await sb.storage.from("post-images").upload(path, body, {
    contentType,
    upsert: true,
  });
  if (error) throw error;
  return sb.storage.from("post-images").getPublicUrl(path).data.publicUrl;
}

async function jpeg(color: { r: number; g: number; b: number }): Promise<Buffer> {
  return sharp({
    create: { width: 640, height: 480, channels: 3, background: color },
  })
    .jpeg({ quality: 85 })
    .toBuffer();
}

function articleHtml(input: {
  title: string;
  author: string;
  body: string;
  coverUrl: string;
  bodyImageUrl: string;
  postId: string;
}): string {
  return `<!doctype html>
<html><head>
<meta charset="utf-8"/>
<title>${input.title}</title>
<meta property="og:image" content="${input.coverUrl}"/>
</head><body>
<article class="post" data-post-id="${input.postId}">
  <h1 class="title">${input.title}</h1>
  <div class="meta"><span class="author">${input.author}</span>
  <time datetime="2026-03-01T10:00:00Z">2026-03-01</time>
  <span class="views">42</span></div>
  <img class="cover" src="${input.coverUrl}" alt="cover"/>
  <div class="content">
    <p>${input.body}</p>
    <p>Second paragraph with enough characters for full-content publish validation rules.</p>
    <img class="body-img" src="${input.bodyImageUrl}" alt="body"/>
  </div>
</article>
</body></html>`;
}

function listHtml(items: Array<{ href: string; title: string }>): string {
  const lis = items
    .map((it) => `<li class="item"><a class="detail" href="${it.href}">${it.title}</a></li>`)
    .join("\n");
  return `<!doctype html><html><head><meta charset="utf-8"/><title>QA List</title></head>
<body><ul class="list">${lis}</ul></body></html>`;
}

async function pixelCheck(url: string) {
  const res = await fetch(url, { method: "GET", redirect: "follow" });
  const buf = Buffer.from(await res.arrayBuffer());
  const contentType = String(res.headers.get("content-type") ?? "");
  const meta = await sharp(buf).metadata();
  return {
    ok: res.ok && contentType.includes("image/") && buf.byteLength > 0 && (meta.width ?? 0) > 0,
    status: res.status,
    contentType,
    bytes: buf.byteLength,
    width: meta.width,
    height: meta.height,
  };
}

const runE2e = process.env.COMMUNITY_CRAWL_REBUILD_E2E === "1";

describe.runIf(runE2e)("Crawler rebuild PUBLIC HTTP AUTO E2E", () => {
  it(
    "fetch → media → publish → posts/links/images → pixels; recrawl upsert",
    async () => {
      loadEnvLocal();
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
      expect(url && key).toBeTruthy();
      const sb = createClient(url!, key!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      const { data: travelBefore } = await sb
        .from("community_crawl_sources")
        .select("policy_status,media_policy")
        .eq("id", TRAVEL_PH_SOURCE_ID)
        .maybeSingle();

      const stamp = Date.now();
      const coverBuf = await jpeg({ r: 40, g: 120, b: 200 });
      const bodyBuf = await jpeg({ r: 200, g: 90, b: 40 });
      const articles: Array<{ id: string; title: string; href: string }> = [];

      for (let i = 1; i <= 3; i++) {
        const id = `qa-${stamp}-${i}`;
        const coverUrl = await upload(sb, `${FIXTURE_PREFIX}/${id}-cover.jpg`, coverBuf, "image/jpeg");
        const bodyImageUrl = await upload(
          sb,
          `${FIXTURE_PREFIX}/${id}-body.jpg`,
          bodyBuf,
          "image/jpeg"
        );
        const html = articleHtml({
          title: `QA Rebuild Article ${i} ${stamp}`,
          author: `QA Author ${i}`,
          body: `QA rebuild public HTTP body for article ${i}. This text is intentionally long enough.`,
          coverUrl,
          bodyImageUrl,
          postId: id,
        });
        const href = await upload(
          sb,
          `${FIXTURE_PREFIX}/${id}.html`,
          Buffer.from(html, "utf8"),
          "text/html; charset=utf-8"
        );
        articles.push({ id, title: `QA Rebuild Article ${i} ${stamp}`, href });
      }

      const listUrl = await upload(
        sb,
        `${FIXTURE_PREFIX}/list-${stamp}.html`,
        Buffer.from(
          listHtml(articles.map((a) => ({ href: a.href, title: a.title }))),
          "utf8"
        ),
        "text/html; charset=utf-8"
      );

      const { data: topic } = await sb
        .from("community_topics")
        .select("id")
        .eq("slug", TOPIC_SLUG)
        .maybeSingle();
      expect(topic?.id).toBeTruthy();

      let sourceId: string;
      const { data: existingSrc } = await sb
        .from("community_crawl_sources")
        .select("id")
        .eq("name", SOURCE_NAME)
        .maybeSingle();
      if (existingSrc?.id) {
        sourceId = String(existingSrc.id);
        const { error } = await sb
          .from("community_crawl_sources")
          .update({
            base_url: url,
            status: "ACTIVE",
            policy_status: "ALLOWED",
            media_policy: "MEDIA_ALLOWED",
            publish_mode: "FULL_CONTENT",
            crawler_type: "generic_html",
            adapter_key: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", sourceId);
        expect(error).toBeNull();
      } else {
        const { data: created, error } = await sb
          .from("community_crawl_sources")
          .insert({
            name: SOURCE_NAME,
            base_url: url,
            status: "ACTIVE",
            policy_status: "ALLOWED",
            media_policy: "MEDIA_ALLOWED",
            publish_mode: "FULL_CONTENT",
            crawler_type: "generic_html",
            adapter_key: null,
          })
          .select("id")
          .single();
        expect(error).toBeNull();
        sourceId = String(created!.id);
      }

      const adapterConfig = {
        listItemSelector: "li.item",
        detailLinkSelector: "a.detail",
        titleSelector: "h1.title",
        contentSelector: "div.content",
        authorSelector: "span.author",
        dateSelector: "time",
        viewSelector: "span.views",
        imageSelector: "img.body-img",
        representativeImageSelector: "img.cover",
        sourcePostIdSelector: "article.post",
        sourcePostIdAttr: "data-post-id",
      };

      let boardId: string;
      const { data: existingBoard } = await sb
        .from("community_crawl_boards")
        .select("id")
        .eq("source_id", sourceId)
        .eq("name", BOARD_NAME)
        .maybeSingle();
      if (existingBoard?.id) {
        boardId = String(existingBoard.id);
        const { error } = await sb
          .from("community_crawl_boards")
          .update({
            list_url: listUrl,
            dibay_topic_id: topic!.id,
            crawl_mode: "generic_html",
            adapter_config: adapterConfig,
            ingest_mode: "AUTO_PUBLISH",
            update_policy: "CREATE_ONLY",
            author_policy: "SOURCE_AUTHOR",
            date_policy: "SOURCE_DATE",
            view_policy: "SOURCE_VIEW",
            enabled: true,
            schedule_enabled: false,
            max_posts: 5,
            updated_at: new Date().toISOString(),
          })
          .eq("id", boardId);
        expect(error).toBeNull();
      } else {
        const { data: created, error } = await sb
          .from("community_crawl_boards")
          .insert({
            source_id: sourceId,
            name: BOARD_NAME,
            list_url: listUrl,
            dibay_topic_id: topic!.id,
            crawl_mode: "generic_html",
            adapter_config: adapterConfig,
            ingest_mode: "AUTO_PUBLISH",
            update_policy: "CREATE_ONLY",
            author_policy: "SOURCE_AUTHOR",
            date_policy: "SOURCE_DATE",
            view_policy: "SOURCE_VIEW",
            enabled: true,
            schedule_enabled: false,
            max_posts: 5,
          })
          .select("id")
          .single();
        expect(error).toBeNull();
        boardId = String(created!.id);
      }

      const board = await getCommunityCrawlBoard(sb, boardId);
      const source = await getCommunityCrawlSource(sb, sourceId);
      expect(board && source).toBeTruthy();

      const crawl1 = await runCommunityCrawlBoard({
        sb,
        board: board!,
        source: source!,
        runKind: "MANUAL",
        maxPostsOverride: 3,
      });

      expect(crawl1.status).not.toBe("FAILED");
      expect(crawl1.publishedCount).toBeGreaterThanOrEqual(3);
      expect(crawl1.publishFailed).toBe(0);

      const postIds = crawl1.items
        .map((i) => i.published_post_id)
        .filter((id): id is string => Boolean(id));
      expect(postIds.length).toBeGreaterThanOrEqual(3);

      const { data: posts } = await sb
        .from("community_posts")
        .select("id,title,images")
        .in("id", postIds);
      const { data: links } = await sb
        .from("community_crawl_post_links")
        .select("id")
        .in("community_post_id", postIds);
      const { data: images } = await sb
        .from("community_post_images")
        .select("post_id,image_url,storage_path,sort_order")
        .in("post_id", postIds)
        .order("sort_order", { ascending: true });
      const { data: mediaRows } = await sb
        .from("community_crawl_item_media")
        .select("id")
        .in(
          "crawl_item_id",
          crawl1.items.map((i) => i.id)
        )
        .eq("is_current", true);

      expect(posts?.length ?? 0).toBeGreaterThanOrEqual(3);
      expect(links?.length ?? 0).toBeGreaterThanOrEqual(3);
      expect(images?.length ?? 0).toBeGreaterThanOrEqual(3);
      expect(mediaRows?.length ?? 0).toBeGreaterThanOrEqual(3);

      for (const img of images ?? []) {
        const px = await pixelCheck(String(img.image_url));
        expect(px.ok).toBe(true);
      }

      const crawl2 = await runCommunityCrawlBoard({
        sb,
        board: board!,
        source: source!,
        runKind: "MANUAL",
        maxPostsOverride: 3,
      });
      expect(crawl2.insertedCount).toBe(0);
      expect(
        crawl2.duplicateCount + crawl2.updatedCount + crawl2.alreadyPublishedCount
      ).toBeGreaterThanOrEqual(3);

      const { data: travelAfter } = await sb
        .from("community_crawl_sources")
        .select("policy_status,media_policy")
        .eq("id", TRAVEL_PH_SOURCE_ID)
        .maybeSingle();
      expect(travelAfter?.policy_status).toBe(travelBefore?.policy_status);
      expect(travelAfter?.media_policy).toBe(travelBefore?.media_policy);
      expect(travelAfter?.policy_status).toBe("REVIEW_REQUIRED");
    },
    180_000
  );
});
