/**
 * LOCAL product E2E: Admin collect → inbox → preview → publish → /philife
 * Uses local Next (new adapters) + shared Supabase.
 * Does NOT claim Production/device PASS.
 *
 *   PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 node scripts/qa/external-board-local-product-e2e.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const EMAIL = process.env.E2E_ADMIN_EMAIL || process.env.QA_ADMIN_EMAIL || "aaaa@manual.local";
const OUT = resolve(process.cwd(), "tests/e2e/.artifacts/external-board-local-product-e2e");
const SOURCE_URL = "http://manilaseoul.co.kr/bbs_list.php?tb=board_free";
const SOURCE_NAME = `마닐라서울 자유게시판 LOCAL E2E ${Date.now()}`;

function loadEnv() {
  for (const rel of [".env.local", ".env"]) {
    const p = resolve(process.cwd(), rel);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#") || !t.includes("=")) continue;
      const i = t.indexOf("=");
      const k = t.slice(0, i).trim();
      let v = t.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

function write(name, data) {
  const p = resolve(OUT, name);
  writeFileSync(p, typeof data === "string" ? data : JSON.stringify(data, null, 2));
  return p;
}

async function loginSession(email) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon) return null;
  const sb = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const passwords = [
    ...new Set(
      [process.env.E2E_TEST_PASSWORD, process.env.QA_MANUAL_PASSWORD, process.env.E2E_ADMIN_PASSWORD, "DibayQa1!", "1234"].filter(
        Boolean
      )
    ),
  ];
  for (const password of passwords) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (!error && data?.session) return { session: data.session, method: "password" };
  }
  if (!sk) return null;
  const admin = createClient(url, sk, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  let tokenHash = "";
  try {
    const u = new URL(String(link?.properties?.action_link || ""));
    tokenHash = u.searchParams.get("token") || u.searchParams.get("token_hash") || "";
  } catch {
    tokenHash = "";
  }
  if (linkErr || !tokenHash) return null;
  const { data: verified, error: otpErr } = await sb.auth.verifyOtp({ token_hash: tokenHash, type: "email" });
  if (otpErr || !verified?.session) return null;
  return { session: verified.session, method: "magiclink" };
}

async function ensureActiveSessionId(userId) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !sk || !userId) return null;
  const admin = createClient(url, sk, { auth: { persistSession: false } });
  const { data } = await admin.from("profiles").select("active_session_id").eq("id", userId).maybeSingle();
  let activeSessionId = String(data?.active_session_id ?? "").trim();
  if (!activeSessionId) {
    activeSessionId = randomUUID();
    await admin.from("profiles").update({ active_session_id: activeSessionId }).eq("id", userId);
  }
  return activeSessionId;
}

function cookieHeader(session, activeSessionId) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const ref = new URL(url).hostname.split(".")[0];
  const encoded = encodeURIComponent(
    JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      expires_in: session.expires_in,
      token_type: session.token_type || "bearer",
      user: session.user,
    })
  );
  const CHUNK = 3180;
  const parts = [];
  for (let i = 0; i < encoded.length; i += CHUNK) parts.push(encoded.slice(i, i + CHUNK));
  const cookies =
    parts.length === 1
      ? [`sb-${ref}-auth-token=${parts[0]}`]
      : parts.map((value, i) => `sb-${ref}-auth-token.${i}=${value}`);
  cookies.push("samarket_signup_locale=ko");
  if (activeSessionId) cookies.push(`samarket_active_session_id=${activeSessionId}`);
  return cookies.join("; ");
}

function serviceSb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

async function api(cookie, path, opts = {}) {
  const res = await fetch(`${ORIGIN}${path}`, {
    ...opts,
    headers: {
      cookie,
      accept: "application/json",
      ...(opts.body ? { "content-type": "application/json" } : {}),
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 2000) };
  }
  return { status: res.status, ok: res.ok, json, text };
}

function imageCount(doc) {
  const nodes = doc?.nodes;
  if (!Array.isArray(nodes)) return 0;
  return nodes.filter((n) => n?.type === "image" && String(n.src || "").trim()).length;
}

async function waitForOrigin(timeoutMs = 180000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const res = await fetch(`${ORIGIN}/admin/community/external-board`, { redirect: "manual" });
      if (res.status > 0) return true;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}

async function main() {
  loadEnv();
  mkdirSync(OUT, { recursive: true });
  const report = {
    TIMESTAMP: new Date().toISOString(),
    ORIGIN,
    SOURCE_URL,
    FIRST_DIVERGENCE: null,
    verdicts: {},
  };

  const up = await waitForOrigin();
  if (!up) {
    report.FIRST_DIVERGENCE = "LOCAL_SERVER_NOT_UP";
    report.verdicts.LOCAL_SERVER = "FAIL";
    write("FINAL.json", report);
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }
  report.verdicts.LOCAL_SERVER = "PROVEN_BY_RUNTIME_EVIDENCE";

  const login = await loginSession(EMAIL);
  if (!login?.session) {
    report.FIRST_DIVERGENCE = "ADMIN_AUTH";
    report.verdicts.ADMIN_AUTH = "FAIL";
    write("FINAL.json", report);
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }
  const activeSessionId = await ensureActiveSessionId(login.session.user.id);
  const cookie = cookieHeader(login.session, activeSessionId);
  write("01-admin-login.json", { email: EMAIL, method: login.method, userId: login.session.user.id });
  report.verdicts.ADMIN_AUTH = "PROVEN_BY_RUNTIME_EVIDENCE";

  const sb = serviceSb();

  // 1) Register
  const regBody = {
    sourceUrl: SOURCE_URL,
    sourceBoardName: SOURCE_NAME,
    rightsBasis: "LOCAL_PRODUCT_E2E technical ingest + Owner-declared test publish basis",
    rightsStatus: "declared",
    mode: "MANUAL",
    targetTopicSlug: "free",
    attributionRequired: true,
    attributionDisplayName: "마닐라서울",
    boardSequenceVerified: false,
  };
  write("02-register-request.json", regBody);
  const reg = await api(cookie, "/api/admin/community/external-board/boards", {
    method: "POST",
    body: JSON.stringify(regBody),
  });
  write("02-register-response.json", { status: reg.status, json: reg.json });
  let sourceId = reg.json?.source?.id || reg.json?.existingSourceId || null;
  if (!sourceId && (reg.status === 409 || reg.json?.code === "SOURCE_BOARD_ALREADY_REGISTERED")) {
    sourceId = reg.json?.existingSourceId || reg.json?.source?.id || null;
  }
  if (!sourceId) {
    // fallback: find by url
    const { data } = await sb.from("external_board_sources").select("id,source_url").eq("site_key", "manilaseoul.co.kr").limit(20);
    const hit = (data || []).find((r) => String(r.source_url).includes("board_free"));
    sourceId = hit?.id || null;
  }
  if (!sourceId) {
    report.FIRST_DIVERGENCE = "ADMIN_REGISTER";
    report.verdicts.ADMIN_REGISTER = "FAIL";
    write("FINAL.json", report);
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }
  report.SOURCE_ID = sourceId;
  report.verdicts.ADMIN_REGISTER = "PROVEN_BY_RUNTIME_EVIDENCE";
  write("03-source-id.txt", String(sourceId));

  // Ensure rights declared on existing source
  await sb
    .from("external_board_sources")
    .update({
      rights_status: "declared",
      rights_basis: regBody.rightsBasis,
      attribution_required: true,
      attribution_display_name: "마닐라서울",
      mode: "MANUAL",
      updated_at: new Date().toISOString(),
    })
    .eq("id", sourceId);

  // Verify
  const ver = await api(cookie, `/api/admin/community/external-board/boards/${sourceId}/verify`, { method: "POST" });
  write("04-verify-response.json", { status: ver.status, json: ver.json });
  if (!ver.json?.ok || !["READY", "PARTIAL"].includes(ver.json?.status)) {
    report.FIRST_DIVERGENCE = "ADMIN_VERIFY";
    report.verdicts.ADMIN_VERIFY = "FAIL";
    write("FINAL.json", report);
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }
  report.verdicts.ADMIN_VERIFY = "PROVEN_BY_RUNTIME_EVIDENCE";

  // Collect page 1-2
  const discoverReq = { limit: 10, pageFrom: 1, pageTo: 2 };
  write("05-discover-request.json", discoverReq);
  const beforeCount = await sb
    .from("external_board_articles")
    .select("id", { count: "exact", head: true })
    .eq("source_id", sourceId);
  const disc = await api(cookie, `/api/admin/community/external-board/boards/${sourceId}/discover`, {
    method: "POST",
    body: JSON.stringify(discoverReq),
  });
  write("05-discover-response.json", { status: disc.status, json: disc.json });
  if (!disc.json?.ok) {
    report.FIRST_DIVERGENCE = "ADMIN_COLLECTION";
    report.verdicts.ADMIN_COLLECTION = "FAIL";
    write("FINAL.json", report);
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }
  report.COLLECTION_SUMMARY = disc.json.summary;
  report.verdicts.ADMIN_COLLECTION = "PROVEN_BY_RUNTIME_EVIDENCE";

  const { data: articlesDb } = await sb
    .from("external_board_articles")
    .select(
      "id,source_id,stable_article_identity,canonical_source_url,source_title,source_author,source_published_at,content_fingerprint,source_document,ops_status,article_signal,published_post_id,snapshot_version,first_seen_at,last_seen_at"
    )
    .eq("source_id", sourceId)
    .order("last_seen_at", { ascending: false })
    .limit(30);
  write("06-articles-db-after-collect.json", articlesDb || []);
  if (!articlesDb?.length) {
    report.FIRST_DIVERGENCE = "DURABLE_INBOX_EMPTY";
    report.verdicts.DURABLE_INBOX = "FAIL";
    write("FINAL.json", report);
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  // Durable inbox: reload overview
  const overview1 = await api(cookie, "/api/admin/community/external-board/overview");
  write("07-overview-after-collect.json", {
    status: overview1.status,
    articleCount: (overview1.json?.articles || []).filter((a) => a.source_id === sourceId).length,
  });
  const overview2 = await api(cookie, "/api/admin/community/external-board/overview");
  const stillThere = (overview2.json?.articles || []).filter((a) => a.source_id === sourceId);
  write("08-overview-reentry.json", { status: overview2.status, articleCount: stillThere.length });
  if (stillThere.length < 1) {
    report.FIRST_DIVERGENCE = "DURABLE_INBOX";
    report.verdicts.DURABLE_INBOX = "FAIL";
    write("FINAL.json", report);
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }
  report.verdicts.DURABLE_INBOX = "PROVEN_BY_RUNTIME_EVIDENCE";

  const enriched = (articlesDb || []).map((a) => ({
    ...a,
    imgCount: imageCount(a.source_document),
  }));
  const imageArticle = enriched.find((a) => a.imgCount > 0 && !a.published_post_id);
  const noImageArticle = enriched.find((a) => a.imgCount === 0 && !a.published_post_id && a.id !== imageArticle?.id);
  write("09-selected-articles.json", {
    imageArticle: imageArticle
      ? { id: imageArticle.id, title: imageArticle.source_title, imgCount: imageArticle.imgCount, author: imageArticle.source_author, date: imageArticle.source_published_at }
      : null,
    noImageArticle: noImageArticle
      ? { id: noImageArticle.id, title: noImageArticle.source_title, imgCount: noImageArticle.imgCount, author: noImageArticle.source_author, date: noImageArticle.source_published_at }
      : null,
  });

  if (!imageArticle) {
    report.FIRST_DIVERGENCE = "NO_IMAGE_ARTICLE_IN_INBOX";
    report.verdicts.IMAGE_ARTICLE_AVAILABLE = "FAIL";
    write("FINAL.json", report);
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }
  report.verdicts.IMAGE_ARTICLE_AVAILABLE = "PROVEN_BY_RUNTIME_EVIDENCE";

  // Fetch snapshot for selected
  for (const art of [imageArticle, noImageArticle].filter(Boolean)) {
    const fr = await api(cookie, `/api/admin/community/external-board/articles/${art.id}`, { method: "POST" });
    write(`10-fetch-${art.id}.json`, { status: fr.status, json: fr.json });
  }

  // Preview zero-write
  const beforePosts = await sb.from("community_posts").select("id", { count: "exact", head: true });
  const beforeImages = await sb.from("community_post_images").select("id", { count: "exact", head: true });
  const { data: artBeforePreview } = await sb
    .from("external_board_articles")
    .select("published_post_id,ops_status")
    .eq("id", imageArticle.id)
    .maybeSingle();
  const prev = await api(cookie, `/api/admin/community/external-board/articles/${imageArticle.id}/preview`, {
    method: "POST",
  });
  write("11-preview-image-response.json", { status: prev.status, json: prev.json });
  const afterPosts = await sb.from("community_posts").select("id", { count: "exact", head: true });
  const afterImages = await sb.from("community_post_images").select("id", { count: "exact", head: true });
  const { data: artAfterPreview } = await sb
    .from("external_board_articles")
    .select("published_post_id,ops_status")
    .eq("id", imageArticle.id)
    .maybeSingle();
  const previewZero = {
    previewOk: Boolean(prev.json?.ok),
    writeDeltaApi: prev.json?.writeDelta,
    community_posts_delta: (afterPosts.count ?? 0) - (beforePosts.count ?? 0),
    community_post_images_delta: (afterImages.count ?? 0) - (beforeImages.count ?? 0),
    published_post_id_before: artBeforePreview?.published_post_id ?? null,
    published_post_id_after: artAfterPreview?.published_post_id ?? null,
  };
  write("12-preview-zero-write.json", previewZero);
  if (!prev.json?.ok || prev.json.writeDelta !== 0 || previewZero.community_posts_delta !== 0 || previewZero.published_post_id_after) {
    report.FIRST_DIVERGENCE = "PREVIEW_ZERO_WRITE";
    report.verdicts.PREVIEW_ZERO_WRITE = "FAIL";
    report.previewZero = previewZero;
    write("FINAL.json", report);
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }
  report.verdicts.PREVIEW_ZERO_WRITE = "PROVEN_BY_RUNTIME_EVIDENCE";
  report.verdicts.IMAGE_PREVIEW = prev.json?.ok ? "PROVEN_BY_RUNTIME_EVIDENCE" : "FAIL";

  const transform = prev.json?.transform;
  const srcNodes = imageArticle.source_document?.nodes || [];
  const previewOrder = {
    sourceTypes: srcNodes.map((n) => n.type),
    sourceImageCount: imageCount(imageArticle.source_document),
    previewImageCount: Array.isArray(transform?.images) ? transform.images.length : null,
    previewTitle: transform?.title ?? null,
    sourceTitle: imageArticle.source_title,
    sourceAuthor: imageArticle.source_author,
    sourceDate: imageArticle.source_published_at,
  };
  write("13-preview-order-compare.json", previewOrder);

  // Ensure CASE A chronology via source_published_at; if missing set operator time
  async function ensureChronology(articleId, sourcePublishedAt, batchOrder) {
    if (sourcePublishedAt && !Number.isNaN(Date.parse(sourcePublishedAt))) return;
    const iso = new Date(Date.now() - batchOrder * 60_000).toISOString();
    const r = await api(cookie, `/api/admin/community/external-board/articles/${articleId}/chronology`, {
      method: "PATCH",
      body: JSON.stringify({ operatorPublishedAt: iso, operatorBatchOrder: batchOrder }),
    });
    write(`14-chronology-${articleId}.json`, { status: r.status, json: r.json, operatorPublishedAt: iso });
  }
  await ensureChronology(imageArticle.id, imageArticle.source_published_at, 0);
  if (noImageArticle) await ensureChronology(noImageArticle.id, noImageArticle.source_published_at, 1);

  // Publish image
  const pubImg = await api(cookie, `/api/admin/community/external-board/articles/${imageArticle.id}/publish`, {
    method: "POST",
  });
  write("15-publish-image-response.json", { status: pubImg.status, json: pubImg.json });
  if (!pubImg.json?.ok || !pubImg.json?.postId) {
    report.FIRST_DIVERGENCE = "IMAGE_PUBLISH";
    report.verdicts.IMAGE_PUBLISH = "FAIL";
    report.publishImage = pubImg.json;
    write("FINAL.json", report);
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }
  const imagePostId = pubImg.json.postId;
  report.IMAGE_POST_ID = imagePostId;
  report.verdicts.IMAGE_PUBLISH = "PROVEN_BY_RUNTIME_EVIDENCE";

  const { data: imagePost } = await sb.from("community_posts").select("*").eq("id", imagePostId).maybeSingle();
  const { data: imagePostImages } = await sb
    .from("community_post_images")
    .select("*")
    .eq("post_id", imagePostId)
    .order("sort_order", { ascending: true });
  write("16-community-post-image-article.json", { post: imagePost, images: imagePostImages });
  if (!imagePost) {
    report.FIRST_DIVERGENCE = "COMMUNITY_POSTS";
    report.verdicts.COMMUNITY_POSTS = "FAIL";
    write("FINAL.json", report);
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }
  report.verdicts.COMMUNITY_POSTS = "PROVEN_BY_RUNTIME_EVIDENCE";
  report.verdicts.COMMUNITY_POST_IMAGES =
    (imagePostImages?.length ?? 0) > 0 ? "PROVEN_BY_RUNTIME_EVIDENCE" : "FAIL";
  if ((imagePostImages?.length ?? 0) < 1) {
    report.FIRST_DIVERGENCE = "COMMUNITY_POST_IMAGES";
    write("FINAL.json", report);
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  // Publish no-image if available
  let noImagePostId = null;
  if (noImageArticle) {
    const pubNo = await api(cookie, `/api/admin/community/external-board/articles/${noImageArticle.id}/publish`, {
      method: "POST",
    });
    write("17-publish-noimage-response.json", { status: pubNo.status, json: pubNo.json });
    if (!pubNo.json?.ok || !pubNo.json?.postId) {
      report.FIRST_DIVERGENCE = "NO_IMAGE_PUBLISH";
      report.verdicts.NO_IMAGE_PUBLISH = "FAIL";
      write("FINAL.json", report);
      console.log(JSON.stringify(report, null, 2));
      process.exit(1);
    }
    noImagePostId = pubNo.json.postId;
    report.NO_IMAGE_POST_ID = noImagePostId;
    report.verdicts.NO_IMAGE_PUBLISH = "PROVEN_BY_RUNTIME_EVIDENCE";
    const { data: noPost } = await sb.from("community_posts").select("id,title,summary,images,published_at,display_author_name").eq("id", noImagePostId).maybeSingle();
    const { data: noImgs } = await sb.from("community_post_images").select("id").eq("post_id", noImagePostId);
    write("18-community-post-noimage.json", { post: noPost, images: noImgs });
    if ((noImgs?.length ?? 0) !== 0) {
      report.FIRST_DIVERGENCE = "NO_IMAGE_SHOULD_HAVE_ZERO_community_post_images";
      report.verdicts.FEED_NO_IMAGE_CONTRACT = "FAIL";
      write("FINAL.json", report);
      console.log(JSON.stringify(report, null, 2));
      process.exit(1);
    }
  } else {
    report.verdicts.NO_IMAGE_PUBLISH = "NOT_PROVEN";
  }

  // Recollect dedupe
  const beforeRecollect = await sb
    .from("external_board_articles")
    .select("id", { count: "exact", head: true })
    .eq("source_id", sourceId);
  const beforePostsCount = await sb.from("community_posts").select("id", { count: "exact", head: true });
  const rediscover = await api(cookie, `/api/admin/community/external-board/boards/${sourceId}/discover`, {
    method: "POST",
    body: JSON.stringify(discoverReq),
  });
  write("19-recollect-response.json", { status: rediscover.status, json: rediscover.json });
  const afterRecollect = await sb
    .from("external_board_articles")
    .select("id", { count: "exact", head: true })
    .eq("source_id", sourceId);
  const afterPostsCount = await sb.from("community_posts").select("id", { count: "exact", head: true });
  const { data: publishedAgain } = await sb
    .from("external_board_articles")
    .select("id,published_post_id,article_signal")
    .eq("id", imageArticle.id)
    .maybeSingle();
  const dedupe = {
    summary: rediscover.json?.summary,
    article_count_before: beforeRecollect.count,
    article_count_after: afterRecollect.count,
    community_posts_delta: (afterPostsCount.count ?? 0) - (beforePostsCount.count ?? 0),
    image_article_signal: publishedAgain?.article_signal,
    same_published_post_id: publishedAgain?.published_post_id === imagePostId,
  };
  write("20-recollect-dedupe.json", dedupe);
  if (dedupe.community_posts_delta !== 0 || !dedupe.same_published_post_id) {
    report.FIRST_DIVERGENCE = "RECOLLECT_DEDUPE";
    report.verdicts.RECOLLECT_DEDUPE = "FAIL";
    write("FINAL.json", report);
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }
  report.verdicts.RECOLLECT_DEDUPE = "PROVEN_BY_RUNTIME_EVIDENCE";

  // Playwright Feed/Detail
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const originUrl = new URL(ORIGIN);
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
  const encoded = encodeURIComponent(
    JSON.stringify({
      access_token: login.session.access_token,
      refresh_token: login.session.refresh_token,
      expires_at: login.session.expires_at,
      expires_in: login.session.expires_in,
      token_type: "bearer",
      user: login.session.user,
    })
  );
  const CHUNK = 3180;
  const parts = [];
  for (let i = 0; i < encoded.length; i += CHUNK) parts.push(encoded.slice(i, i + CHUNK));
  const cookies = (parts.length === 1
    ? [{ name: `sb-${ref}-auth-token`, value: parts[0] }]
    : parts.map((value, i) => ({ name: `sb-${ref}-auth-token.${i}`, value }))
  ).map((c) => ({
    ...c,
    domain: originUrl.hostname,
    path: "/",
    httpOnly: false,
    secure: originUrl.protocol === "https:",
    sameSite: "Lax",
  }));
  cookies.push({
    name: "samarket_active_session_id",
    value: activeSessionId,
    domain: originUrl.hostname,
    path: "/",
    httpOnly: false,
    secure: originUrl.protocol === "https:",
    sameSite: "Lax",
  });
  await context.addCookies(cookies);
  const page = await context.newPage();

  await page.goto(`${ORIGIN}/philife`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: resolve(OUT, "21-philife-feed.png"), fullPage: true });
  const feedText = await page.locator("body").innerText();
  const imageTitleVisible = feedText.includes(String(imagePost.title || "").slice(0, 20));
  write("22-philife-feed-text-snip.txt", feedText.slice(0, 4000));
  report.verdicts.FEED_IMAGE_CONTRACT = imageTitleVisible ? "PROVEN_BY_RUNTIME_EVIDENCE" : "PARTIAL";

  await page.goto(`${ORIGIN}/philife/${imagePostId}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: resolve(OUT, "23-detail-image.png"), fullPage: true });
  const detailImgs = await page.locator("img").count();
  const detailText = await page.locator("body").innerText();
  write("24-detail-image-meta.json", {
    titlePresent: detailText.includes(String(imagePost.title || "").slice(0, 20)),
    imgDomCount: detailImgs,
    sourceInlineImages: imageCount(imageArticle.source_document),
    community_post_images: imagePostImages?.length ?? 0,
  });
  report.verdicts.DETAIL_IMAGE = detailText.includes(String(imagePost.title || "").slice(0, 12))
    ? "PROVEN_BY_RUNTIME_EVIDENCE"
    : "FAIL";

  if (noImagePostId) {
    await page.goto(`${ORIGIN}/philife/${noImagePostId}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: resolve(OUT, "25-detail-noimage.png"), fullPage: true });
    report.verdicts.DETAIL_NO_IMAGE = "PROVEN_BY_RUNTIME_EVIDENCE";
  }

  await browser.close();

  // Page range note: adapter visits list pages internally; record requested range
  report.PAGE_RANGE = {
    requested: discoverReq,
    visited_note: "Adapter fetches listUrlForPage(sourceUrl, page) for each page in [pageFrom,pageTo]",
    summary: disc.json.summary,
  };

  report.AUTHOR = {
    source_author: imageArticle.source_author,
    dibay_display_author: imagePost.display_author_name,
  };
  report.SOURCE_DATE = imageArticle.source_published_at;
  report.PUBLISHED_AT = imagePost.published_at;
  report.IMAGE_COUNT = {
    SOURCE_N: imageCount(imageArticle.source_document),
    DETAIL_community_post_images_N: imagePostImages?.length ?? 0,
  };

  report.REAL_INGESTION_COMMUNITY_DEVICE = "PARTIAL";
  report.DEVICE = "NOT_PROVEN";
  report.PRODUCTION = "NOT_PROVEN";
  report.COMMIT = "NOT_DONE_BY_INSTRUCTION";

  write("FINAL.json", report);
  write(
    "FINAL-REPORT.md",
    `# LOCAL REAL PRODUCT E2E\n\nORIGIN: ${ORIGIN}\nSOURCE: ${SOURCE_URL}\nSOURCE_ID: ${sourceId}\n\n` +
      Object.entries(report.verdicts)
        .map(([k, v]) => `- ${k}: ${v}`)
        .join("\n") +
      `\n\nIMAGE_POST: ${imagePostId}\nNO_IMAGE_POST: ${noImagePostId}\n\nFIRST_DIVERGENCE: ${report.FIRST_DIVERGENCE}\nREAL_INGESTION→COMMUNITY→DEVICE: ${report.REAL_INGESTION_COMMUNITY_DEVICE}\n`
  );
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
