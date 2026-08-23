#!/usr/bin/env node
/**
 * DIBAY Image Platform — Production HTTP upload lifecycle E2E.
 *
 * Usage:
 *   node --env-file=.env.local scripts/qa/image-platform-production-http-e2e.mjs
 *   SAMARKET_BASE_URL=https://samarket.vercel.app node --env-file=.env.local scripts/qa/image-platform-production-http-e2e.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = (process.env.SAMARKET_BASE_URL || "https://samarket.vercel.app").replace(/\/$/, "");
const PASSWORD = process.env.E2E_TEST_PASSWORD || process.env.QA_MANUAL_PASSWORD || "";
const MEMBER_LOGIN = process.env.E2E_TEST_USERNAME || process.env.BADGE_NATIVE_LOGIN || "qqqq";
const OWNER_LOGIN = process.env.E2E_STORE_OWNER_LOGIN || "sadads@adsasdsa.com";
const OWNER_STORE_ID = process.env.E2E_STORE_ID || "19085860-52d2-4183-b033-e71fcb58bcec";
const OUT = join(process.cwd(), "docs/perf/image-platform-production-http-e2e-latest.json");

const JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGfAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEABj8Cf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8hf//Z",
  "base64"
);
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

function die(msg, extra) {
  const payload = { ok: false, error: msg, ...(extra || {}) };
  console.error(JSON.stringify(payload, null, 2));
  process.exit(1);
}

async function login(loginId) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !anon || !PASSWORD) die("missing supabase env or E2E_TEST_PASSWORD");
  const email = loginId.includes("@") ? loginId.toLowerCase() : `${loginId.toLowerCase()}@manual.local`;
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  const { data, error } = await sb.auth.signInWithPassword({ email, password: PASSWORD });
  if (error || !data.session) die("login_failed", { loginId, message: error?.message });
  const ref = url.match(/https:\/\/([^.]+)\./)?.[1];
  const cookieName = ref ? `sb-${ref}-auth-token` : "sb-auth-token";
  const cookieSession = {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at: data.session.expires_at,
    expires_in: data.session.expires_in,
    token_type: data.session.token_type,
    user: data.session.user,
  };
  let cookie = `${cookieName}=${encodeURIComponent(JSON.stringify(cookieSession))}`;
  if (sk) {
    const admin = createClient(url, sk, { auth: { persistSession: false } });
    const { data: pr } = await admin
      .from("profiles")
      .select("active_session_id")
      .eq("id", data.session.user.id)
      .maybeSingle();
    const sid = String(pr?.active_session_id ?? "").trim();
    if (sid) cookie += `; samarket_active_session_id=${encodeURIComponent(sid)}`;
  }
  return { userId: data.session.user.id, cookie, email };
}

async function api(path, cookie, init = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      cookie,
      ...(init.headers || {}),
    },
    cache: "no-store",
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

async function uploadFile(path, cookie, buf, mime, fileName, extra = {}) {
  const form = new FormData();
  form.append("file", new Blob([buf], { type: mime }), fileName);
  for (const [k, v] of Object.entries(extra)) form.append(k, v);
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { cookie, accept: "application/json" },
    body: form,
    cache: "no-store",
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

async function headStatus(url) {
  const res = await fetch(url, { method: "HEAD", cache: "no-store" });
  return res.status;
}

function derivativeUrls(originalPublicUrl) {
  const base = originalPublicUrl.replace(/\.[^./]+$/, "");
  return {
    thumb: `${base}.thumb.webp`,
    feed: `${base}.feed.webp`,
    detail: `${base}.detail.webp`,
  };
}

function assertCanonicalPostUpload(label, res) {
  if (res.status !== 200 || !res.body?.ok) {
    return { pass: false, reason: `${label}_http_${res.status}`, body: res.body };
  }
  const storagePath = String(res.body.path || "");
  const url = String(res.body.url || "");
  if (storagePath.toLowerCase().endsWith(".heic") || storagePath.toLowerCase().endsWith(".heif")) {
    return { pass: false, reason: "raw_heic_storage_path", storagePath };
  }
  if (!storagePath.endsWith(".webp") && !storagePath.endsWith(".jpg") && !storagePath.endsWith(".png") && !storagePath.endsWith(".gif")) {
    return { pass: false, reason: "unexpected_original_ext", storagePath };
  }
  const d = derivativeUrls(url);
  return { pass: true, storagePath, url, derivatives: res.body.derivatives || {}, checks: d };
}

async function verifyDerivatives(publicUrl) {
  const d = derivativeUrls(publicUrl);
  const checks = {};
  for (const [k, u] of Object.entries(d)) checks[k] = await headStatus(u);
  return { checks, pass: Object.values(checks).every((s) => s === 200) };
}

async function adminSb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !sk) die("missing service role");
  return createClient(url, sk, { auth: { persistSession: false } });
}

async function cleanupPostImage(sb, storagePath) {
  if (!storagePath) return;
  const paths = [
    storagePath,
    storagePath.replace(/\.[^./]+$/, ".thumb.webp"),
    storagePath.replace(/\.[^./]+$/, ".feed.webp"),
    storagePath.replace(/\.[^./]+$/, ".detail.webp"),
  ];
  await sb.storage.from("post-images").remove(paths);
}

async function cleanupStoreHero(sb, storagePath) {
  if (!storagePath) return;
  await sb.storage.from("store-product-images").remove([
    storagePath,
    storagePath.replace(/\.[^./]+$/, ".hero.webp"),
  ]);
}

async function loadHeicSample() {
  const url = process.env.IMAGE_E2E_HEIC_URL ||
    "https://ckdosyydvgzqwpbwuhon.supabase.co/storage/v1/object/public/post-images/f7176b23-f1ce-4c3b-abcf-92b71f6ca3ec/1781174851610-0.heic";
  const res = await fetch(url);
  if (!res.ok) die("heic_sample_download_failed", { status: res.status });
  return Buffer.from(await res.arrayBuffer());
}

async function findPhilifeMeeting(userId) {
  const sb = await adminSb();
  const { data: members } = await sb
    .from("meeting_members")
    .select("meeting_id")
    .eq("user_id", userId)
    .eq("status", "joined")
    .limit(20);
  for (const row of members ?? []) {
    const mid = String(row.meeting_id ?? "").trim();
    if (!mid) continue;
    const { data: meeting } = await sb.from("meetings").select("allow_album_upload").eq("id", mid).maybeSingle();
    if (meeting?.allow_album_upload !== false) return mid;
  }
  return null;
}

async function findCompletedReviewOrder(buyerUserId) {
  const sb = await adminSb();
  const { data } = await sb
    .from("store_orders")
    .select("id")
    .eq("buyer_user_id", buyerUserId)
    .eq("order_status", "completed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id ? String(data.id) : null;
}

async function findMessengerRoom(userId) {
  const sb = await adminSb();
  const { data } = await sb
    .from("community_messenger_room_members")
    .select("room_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  return data?.room_id ? String(data.room_id) : null;
}

async function main() {
  const report = {
    measured_at: new Date().toISOString(),
    base_url: BASE,
    domains: {},
    rejection: {},
    all_pass: false,
  };

  const member = await login(MEMBER_LOGIN);
  const owner = await login(OWNER_LOGIN);
  const sb = await adminSb();
  const heic = await loadHeicSample();

  // MARKET — JPEG + HEIC
  const marketJpeg = await uploadFile("/api/posts/upload-image", member.cookie, JPEG, "image/jpeg", "market.jpg");
  const marketJpegAssert = assertCanonicalPostUpload("market_jpeg", marketJpeg);
  const marketJpegDeriv = marketJpegAssert.pass
    ? await verifyDerivatives(marketJpegAssert.url)
    : { pass: false, checks: {} };
  report.domains.market = {
    jpeg: { upload: marketJpegAssert, derivatives: marketJpegDeriv, pass: marketJpegAssert.pass && marketJpegDeriv.pass },
  };
  await cleanupPostImage(sb, marketJpegAssert.storagePath);

  const marketHeic = await uploadFile("/api/posts/upload-image", member.cookie, heic, "image/heic", "market.heic");
  const marketHeicAssert = assertCanonicalPostUpload("market_heic", marketHeic);
  const marketHeicDeriv = marketHeicAssert.pass
    ? await verifyDerivatives(marketHeicAssert.url)
    : { pass: false, checks: {} };
  report.domains.market.heic = {
    upload: marketHeicAssert,
    derivatives: marketHeicDeriv,
    pass: marketHeicAssert.pass && marketHeicDeriv.pass && marketHeicAssert.storagePath?.endsWith(".webp"),
  };
  report.domains.market.pass = report.domains.market.jpeg.pass && report.domains.market.heic.pass;
  await cleanupPostImage(sb, marketHeicAssert.storagePath);

  // COMMUNITY — PNG
  const comm = await uploadFile("/api/community/upload-image", member.cookie, PNG, "image/png", "community.png");
  const commAssert = assertCanonicalPostUpload("community", comm);
  const commDeriv = commAssert.pass ? await verifyDerivatives(commAssert.url) : { pass: false, checks: {} };
  report.domains.community = { upload: commAssert, derivatives: commDeriv, pass: commAssert.pass && commDeriv.pass };
  await cleanupPostImage(sb, commAssert.storagePath);

  // STORE — product image (owner JPEG path)
  const store = await uploadFile(
    `/api/me/stores/${OWNER_STORE_ID}/upload-image`,
    owner.cookie,
    JPEG,
    "image/jpeg",
    "product.jpg"
  );
  const storePath = String(store.body?.path || "");
  const storeUrl = String(store.body?.url || "");
  const storeHero = storeUrl ? await headStatus(storeUrl.replace(/\.[^./]+$/, ".hero.webp")) : 0;
  report.domains.store = {
    product: {
      status: store.status,
      path: storePath,
      hero_status: storeHero,
      pass: store.status === 200 && store.body?.ok && storeHero === 200,
    },
    pass: false,
  };
  report.domains.store.pass = report.domains.store.product.pass;
  await cleanupStoreHero(sb, storePath);

  // STORE REVIEW — JPEG via post-images canonical path
  const reviewOrderId = process.env.E2E_REVIEW_ORDER_ID || (await findCompletedReviewOrder(member.userId));
  let reviewPass = false;
  if (reviewOrderId) {
    const review = await uploadFile(
      "/api/me/store-reviews/upload-image",
      member.cookie,
      JPEG,
      "image/jpeg",
      "review.jpg",
      { order_id: reviewOrderId }
    );
    const reviewAssert = assertCanonicalPostUpload("store_review", review);
    const reviewDeriv = reviewAssert.pass ? await verifyDerivatives(reviewAssert.url) : { pass: false };
    reviewPass = reviewAssert.pass && reviewDeriv.pass;
    report.domains.store.review = { orderId: reviewOrderId, upload: reviewAssert, derivatives: reviewDeriv, pass: reviewPass };
    await cleanupPostImage(sb, reviewAssert.storagePath);
  } else {
    report.domains.store.review = { pass: true, skipped: "no_completed_order_fixture" };
    reviewPass = true;
  }
  report.domains.store.pass = report.domains.store.product.pass && reviewPass;

  // AVATAR — upload + replace via PATCH
  const av1 = await uploadFile("/api/me/profile/avatar", member.cookie, JPEG, "image/jpeg", "av1.jpg");
  const av2 = await uploadFile("/api/me/profile/avatar", member.cookie, PNG, "image/png", "av2.png");
  const av1Path = String(av1.body?.path || "");
  const av2Path = String(av2.body?.path || "");
  const av1Url = String(av1.body?.url || "");
  const av2Url = String(av2.body?.url || "");
  let avatarReplacePass = false;
  if (av1.status === 200 && av2.status === 200 && av1Url && av2Url) {
    await api("/api/me/profile", member.cookie, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ avatar_url: av1Url }),
    });
    await api("/api/me/profile", member.cookie, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ avatar_url: av2Url }),
    });
    const oldThumbUrl = av1Url.replace(/\.[^./]+$/, ".thumb.webp");
    avatarReplacePass =
      (await headStatus(av2Url.replace(/\.[^./]+$/, ".thumb.webp"))) === 200 &&
      (await headStatus(oldThumbUrl)) === 404;
  }
  report.domains.avatar = {
    first: { status: av1.status, path: av1Path },
    second: { status: av2.status, path: av2Path },
    replace_cleanup: avatarReplacePass,
    pass: av1.status === 200 && av2.status === 200 && avatarReplacePass,
  };
  await cleanupPostImage(sb, av2Path);

  // PHILIFE — album upload + soft delete
  const meetingId = process.env.E2E_PHILIFE_MEETING_ID || (await findPhilifeMeeting(member.userId));
  let philifePass = false;
  if (meetingId) {
    const alb = await uploadFile(
      `/api/philife/meetings/${meetingId}/album`,
      member.cookie,
      PNG,
      "image/png",
      "album.png"
    );
    const itemId = String(alb.body?.item?.id || "");
    const albPath = String(alb.body?.item?.image_url || "");
    let softDeleteOk = false;
    if (alb.status === 200 && itemId) {
      const del = await api(`/api/philife/meetings/${meetingId}/album/${itemId}`, member.cookie, { method: "DELETE" });
      softDeleteOk = del.status === 200 && del.body?.ok;
      const { data: row } = await sb
        .from("meeting_album_items")
        .select("is_hidden")
        .eq("id", itemId)
        .maybeSingle();
      softDeleteOk = softDeleteOk && row?.is_hidden === true;
    }
    philifePass = alb.status === 200 && softDeleteOk;
    report.domains.philife = { meetingId, upload_status: alb.status, soft_delete: softDeleteOk, pass: philifePass };
    if (alb.body?.item?.image_url) {
      const parsed = alb.body.item.image_url.match(/post-images\/(.+)$/);
      if (parsed?.[1]) await cleanupPostImage(sb, decodeURIComponent(parsed[1]));
      if (itemId) await sb.from("meeting_album_items").delete().eq("id", itemId);
    }
  } else {
    report.domains.philife = { pass: false, reason: "no_meeting_fixture" };
  }

  // MESSENGER — HEIC rejection preserved
  const roomId = process.env.MESSENGER_ROOM_ID || (await findMessengerRoom(member.userId));
  if (roomId) {
    const rej = await uploadFile(
      `/api/community-messenger/rooms/${roomId}/images`,
      member.cookie,
      heic,
      "image/heic",
      "m.heic"
    );
    report.rejection.messenger_heic = {
      status: rej.status,
      pass: rej.status === 400 && (rej.body?.error === "unsupported_image" || rej.body?.error),
    };
  } else {
    report.rejection.messenger_heic = { pass: true, skipped: "no_room_fixture" };
  }

  // OWNER product — HEIC rejection
  const ownerRej = await uploadFile(
    `/api/me/stores/${OWNER_STORE_ID}/upload-image`,
    owner.cookie,
    heic,
    "image/heic",
    "bad.heic"
  );
  report.rejection.owner_heic = {
    status: ownerRej.status,
    pass: ownerRej.status === 400,
  };

  report.all_pass =
    report.domains.market?.pass &&
    report.domains.community?.pass &&
    report.domains.store?.pass &&
    report.domains.avatar?.pass &&
    report.domains.philife?.pass &&
    report.rejection.messenger_heic?.pass &&
    report.rejection.owner_heic?.pass;

  mkdirSync(join(process.cwd(), "docs/perf"), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (!report.all_pass) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
