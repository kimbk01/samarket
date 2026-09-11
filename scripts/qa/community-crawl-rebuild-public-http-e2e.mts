/**
 * PUBLIC HTTP AUTO E2E for crawler rebuild.
 * Hosts DIBAY-owned fixtures on public Supabase Storage, runs runCommunityCrawlBoard,
 * verifies posts + links + community_post_images + pixel decode.
 *
 * Usage: npx tsx --env-file=.env.local scripts/qa/community-crawl-rebuild-public-http-e2e.mts
 */
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";
import {
  getCommunityCrawlBoard,
  getCommunityCrawlSource,
} from "../../lib/community-crawler/admin-crawl-store.ts";
import { runCommunityCrawlBoard } from "../../lib/community-crawler/core/run-real-crawl.ts";

const FIXTURE_PREFIX = "crawl-qa-fixtures/rebuild-e2e";
const SOURCE_NAME = "DIBAY QA Crawl Fixture (rebuild)";
const BOARD_NAME = "QA AUTO board";
const TOPIC_SLUG = "travel";

function env(k: string): string {
  const v = process.env[k]?.trim();
  if (!v) throw new Error(`missing ${k}`);
  return v;
}

async function upload(
  sb: ReturnType<typeof createClient>,
  path: string,
  body: Buffer | string,
  contentType: string
): Promise<string> {
  const { error } = await sb.storage.from("post-images").upload(path, body, {
    contentType,
    upsert: true,
  });
  if (error) throw error;
  const { data } = sb.storage.from("post-images").getPublicUrl(path);
  return data.publicUrl;
}

async function jpeg(color: { r: number; g: number; b: number }): Promise<Buffer> {
  return sharp({
    create: {
      width: 640,
      height: 480,
      channels: 3,
      background: color,
    },
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

async function pixelCheck(url: string): Promise<{
  ok: boolean;
  status: number;
  contentType: string;
  bytes: number;
  width?: number;
  height?: number;
}> {
  const res = await fetch(url, { method: "GET", redirect: "follow" });
  const buf = Buffer.from(await res.arrayBuffer());
  const contentType = String(res.headers.get("content-type") ?? "");
  let width: number | undefined;
  let height: number | undefined;
  try {
    const meta = await sharp(buf).metadata();
    width = meta.width;
    height = meta.height;
  } catch {
    /* */
  }
  return {
    ok: res.ok && contentType.includes("image/") && buf.byteLength > 0 && (width ?? 0) > 0,
    status: res.status,
    contentType,
    bytes: buf.byteLength,
    width,
    height,
  };
}

async function main() {
  const url = env("NEXT_PUBLIC_SUPABASE_URL");
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const stamp = Date.now();
  const coverBuf = await jpeg({ r: 40, g: 120, b: 200 });
  const bodyBuf = await jpeg({ r: 200, g: 90, b: 40 });

  const articles: Array<{
    id: string;
    title: string;
    href: string;
  }> = [];

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
    .select("id, slug, section_id")
    .eq("slug", TOPIC_SLUG)
    .maybeSingle();
  if (!topic) throw new Error("topic_missing");

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
    if (error) throw error;
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
    if (error || !created) throw error ?? new Error("source_create_failed");
    sourceId = String(created.id);
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
        dibay_topic_id: topic.id,
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
    if (error) throw error;
  } else {
    const { data: created, error } = await sb
      .from("community_crawl_boards")
      .insert({
        source_id: sourceId,
        name: BOARD_NAME,
        list_url: listUrl,
        dibay_topic_id: topic.id,
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
    if (error || !created) throw error ?? new Error("board_create_failed");
    boardId = String(created.id);
  }

  const board = await getCommunityCrawlBoard(sb, boardId);
  const source = await getCommunityCrawlSource(sb, sourceId);
  if (!board || !source) throw new Error("board_or_source_missing");

  const crawl1 = await runCommunityCrawlBoard({
    sb,
    board,
    source,
    runKind: "MANUAL",
    maxPostsOverride: 3,
  });

  const crawl2 = await runCommunityCrawlBoard({
    sb,
    board,
    source,
    runKind: "MANUAL",
    maxPostsOverride: 3,
  });

  const publishedItems = crawl1.items.filter((i) => i.published_post_id);
  const postIds = publishedItems.map((i) => i.published_post_id!).filter(Boolean);

  const { data: posts } = await sb
    .from("community_posts")
    .select("id,title,content,images")
    .in("id", postIds);
  const { data: links } = await sb
    .from("community_crawl_post_links")
    .select("id,community_post_id,canonical_url")
    .in("community_post_id", postIds);
  const { data: images } = await sb
    .from("community_post_images")
    .select("post_id,image_url,storage_path,sort_order")
    .in("post_id", postIds)
    .order("sort_order", { ascending: true });

  const pixels = [];
  for (const img of images ?? []) {
    pixels.push({ url: img.image_url, ...(await pixelCheck(String(img.image_url))) });
  }

  const { data: mediaRows } = await sb
    .from("community_crawl_item_media")
    .select("crawl_item_id,role,is_current,public_url")
    .in(
      "crawl_item_id",
      crawl1.items.map((i) => i.id)
    )
    .eq("is_current", true);

  const report = {
    ok:
      crawl1.status !== "FAILED" &&
      crawl1.publishedCount >= 3 &&
      postIds.length >= 3 &&
      (posts?.length ?? 0) >= 3 &&
      (links?.length ?? 0) >= 3 &&
      (images?.length ?? 0) >= 3 &&
      pixels.length > 0 &&
      pixels.every((p) => p.ok) &&
      crawl2.insertedCount === 0 &&
      (crawl2.duplicateCount + crawl2.updatedCount + crawl2.alreadyPublishedCount) >= 3,
    crawl1: {
      status: crawl1.status,
      inserted: crawl1.insertedCount,
      published: crawl1.publishedCount,
      alreadyPublished: crawl1.alreadyPublishedCount,
      publishFailed: crawl1.publishFailed,
      publishSkippedPolicy: crawl1.publishSkippedPolicy,
      failures: crawl1.failures,
      skippedInvalid: crawl1.skippedInvalid,
    },
    crawl2: {
      status: crawl2.status,
      inserted: crawl2.insertedCount,
      updated: crawl2.updatedCount,
      duplicate: crawl2.duplicateCount,
      published: crawl2.publishedCount,
      alreadyPublished: crawl2.alreadyPublishedCount,
    },
    posts: posts?.map((p) => ({
      id: p.id,
      title: p.title,
      imageJsonLen: Array.isArray(p.images) ? p.images.length : 0,
    })),
    linksCount: links?.length ?? 0,
    imagesCount: images?.length ?? 0,
    mediaCurrentCount: mediaRows?.length ?? 0,
    pixels,
    boardId,
    sourceId,
    listUrl,
    travelPhUntouched: true,
  };

  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
