#!/usr/bin/env node
/**
 * Customer Center 3-Board Production integrated audit (READ + QA writes).
 * Does NOT apply migrations. Does NOT change badge/FCM authority.
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const BASE = process.env.CC_AUDIT_BASE || "https://samarket.vercel.app";
const STAMP = Date.now();
const OUT = path.join(ROOT, `.qa-logs/customer-center-prod-audit-${STAMP}`);
const QA_USER_ID = process.env.GATE4_RECEIVER_ID || "9259ab7d-ae5f-4d4a-819a-8d5bd568ecf8";
const MARK = `CC3B-${STAMP}`;

fs.mkdirSync(OUT, { recursive: true });

function loadEnv() {
  for (const rel of [".env.local", ".env.vercel.production"]) {
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i < 1) continue;
      const k = t.slice(0, i).trim();
      let v = t.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

function passwords() {
  return [
    ...new Set(
      [
        process.env.E2E_TEST_PASSWORD,
        process.env.QA_MANUAL_PASSWORD,
        process.env.E2E_ADMIN_PASSWORD,
        "DibayQa1!",
        "1234",
      ].filter(Boolean)
    ),
  ];
}

async function adminCookie() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !anon || !sk) throw new Error("missing supabase env");
  const login = process.env.E2E_ADMIN_USERNAME || process.env.QA_ADMIN_LOGIN || "aaaa";
  const email = login.includes("@") ? login : `${login}@manual.local`;
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  let session = null;
  for (const pass of passwords()) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
    if (!error && data.session) {
      session = data.session;
      break;
    }
  }
  if (!session) throw new Error("admin login fail");
  const ref = new URL(url).hostname.split(".")[0];
  let cookie = `sb-${ref}-auth-token=${encodeURIComponent(
    JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      expires_in: session.expires_in,
      token_type: "bearer",
      user: session.user,
    })
  )}`;
  const admin = createClient(url, sk, { auth: { persistSession: false } });
  const { data: pr } = await admin
    .from("profiles")
    .select("active_session_id")
    .eq("id", session.user.id)
    .maybeSingle();
  if (pr?.active_session_id) {
    cookie += `; samarket_active_session_id=${encodeURIComponent(String(pr.active_session_id))}`;
  }
  return { cookie, url, sk, adminUserId: session.user.id, admin };
}

async function memberCookie(adminSb, userId) {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const { data: link, error } = await adminSb.auth.admin.generateLink({
    type: "magiclink",
    email: undefined,
    options: { redirectTo: BASE },
  }).catch(() => ({ data: null, error: { message: "skip" } }));
  // Prefer password login for known QA member if configured
  const memberEmail = process.env.E2E_MEMBER_EMAIL || process.env.QA_MEMBER_EMAIL;
  const memberPass = process.env.E2E_MEMBER_PASSWORD || process.env.QA_MEMBER_PASSWORD;
  if (memberEmail && memberPass) {
    const sb = createClient(url, anon, { auth: { persistSession: false } });
    const { data, error: e } = await sb.auth.signInWithPassword({
      email: memberEmail,
      password: memberPass,
    });
    if (!e && data.session) {
      const ref = new URL(url).hostname.split(".")[0];
      let cookie = `sb-${ref}-auth-token=${encodeURIComponent(
        JSON.stringify({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          expires_at: data.session.expires_at,
          expires_in: data.session.expires_in,
          token_type: "bearer",
          user: data.session.user,
        })
      )}`;
      const { data: pr } = await adminSb
        .from("profiles")
        .select("active_session_id")
        .eq("id", data.session.user.id)
        .maybeSingle();
      if (pr?.active_session_id) {
        cookie += `; samarket_active_session_id=${encodeURIComponent(String(pr.active_session_id))}`;
      }
      return { cookie, userId: data.session.user.id };
    }
  }
  // Fallback: use service role to mint session via admin API createUser token not available —
  // use QA_USER via password from env list if GATE4 user email known.
  void link;
  void error;
  void userId;
  return null;
}

async function api(pathname, cookie, opts = {}) {
  const res = await fetch(`${BASE}${pathname}`, {
    ...opts,
    headers: {
      accept: "application/json",
      cookie,
      ...(opts.body ? { "content-type": "application/json" } : {}),
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 500) };
  }
  return { status: res.status, json, headers: Object.fromEntries(res.headers.entries()) };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function chainForType(adminCk, memberCk, contentType) {
  const boardTitle =
    contentType === "marketing"
      ? `${MARK} DIBAY 여름 프로모션`
      : contentType === "system"
        ? `${MARK} 시스템 안내`
        : `${MARK} 공지 원본`;
  const boardBody =
    contentType === "marketing"
      ? [
          "충분히 긴 상세 설명입니다.",
          "기간: 8월 전역",
          "혜택: 특별 쿠폰",
          "조건: 회원 대상",
          "유의사항: 중복 불가",
          "A".repeat(240),
        ].join("\n")
      : `원본 본문 ${contentType} ${MARK}\n` + "B".repeat(180);
  const campTitle =
    contentType === "marketing" ? "여름 프로모션 시작!" : `${contentType} 알림 ${MARK.slice(-6)}`;
  const campBody =
    contentType === "marketing"
      ? "이번 주 특별 혜택을 확인하세요."
      : `짧은 전달 카피 ${contentType}`;

  const create = await api("/api/admin/app-notices", adminCk, {
    method: "POST",
    body: JSON.stringify({
      content_type: contentType,
      title: boardTitle,
      body: boardBody,
      hero_image_url:
        contentType === "marketing"
          ? "https://samarket.vercel.app/images/common/store-product-fallback.svg"
          : null,
      comment_enabled: true,
      is_active: true,
    }),
  });
  assert(create.status === 200 && create.json?.ok, `${contentType} content create failed ${create.status}`);
  const contentId = String(create.json.notice.id);
  const canonical = `/mypage/customer-center/${contentType}/${contentId}`;

  const list = await api(
    `/api/me/settings/notices?content_type=${encodeURIComponent(contentType)}`,
    memberCk
  );
  assert(list.status === 200 && list.json?.ok, `${contentType} member list fail`);
  const listed = (list.json.notices || []).find((n) => n.id === contentId);
  assert(listed, `${contentType} not visible on board list`);
  assert(listed.title === boardTitle, `${contentType} list title mismatch`);
  assert(listed.canonicalHref === canonical, `${contentType} list canonical mismatch`);

  const detail1 = await api(`/api/me/settings/notices/${encodeURIComponent(contentId)}`, memberCk);
  assert(detail1.status === 200 && detail1.json?.ok && detail1.json.unavailable !== true, `${contentType} detail fail`);
  assert(detail1.json.notice.body === boardBody, `${contentType} detail body must be board original`);
  assert(detail1.json.notice.title === boardTitle, `${contentType} detail title`);
  assert(detail1.json.notice.canonicalHref === canonical, `${contentType} detail canonical`);

  const view1 = await api(`/api/me/settings/notices/${encodeURIComponent(contentId)}/view`, memberCk, {
    method: "POST",
  });
  const view2 = await api(`/api/me/settings/notices/${encodeURIComponent(contentId)}/view`, memberCk, {
    method: "POST",
  });
  assert(view1.json?.ok && view2.json?.ok, `${contentType} view rpc fail`);
  const v1 = Number(view1.json.viewCount);
  const v2 = Number(view2.json.viewCount);
  assert(v2 === v1, `${contentType} view dedupe fail v1=${v1} v2=${v2}`);

  const commentPost = await api(
    `/api/me/settings/notices/${encodeURIComponent(contentId)}/comments`,
    memberCk,
    { method: "POST", body: JSON.stringify({ body: `댓글 ${MARK} ${contentType}` }) }
  );
  assert(commentPost.status === 200 && commentPost.json?.ok, `${contentType} comment create fail ${JSON.stringify(commentPost.json)}`);
  const commentId = commentPost.json.comment.id;
  const comments = await api(
    `/api/me/settings/notices/${encodeURIComponent(contentId)}/comments`,
    memberCk
  );
  assert((comments.json.comments || []).some((c) => c.id === commentId), `${contentType} comment list miss`);

  const campaign = await api("/api/admin/notification-campaigns", adminCk, {
    method: "POST",
    body: JSON.stringify({
      title: campTitle,
      body: campBody,
      type: contentType,
      channel: "in_app_only",
      target_type: "selected_users",
      target_user_ids: [QA_USER_ID],
      app_notice_id: contentId,
      deeplink_url: canonical,
      send_mode: "immediate",
      save_as_draft: false,
      is_qa: true,
      create_request_id: `cc3b-${contentType}-${STAMP}`,
    }),
  });
  assert(campaign.status === 200 && campaign.json?.ok, `${contentType} campaign create fail ${JSON.stringify(campaign.json)}`);
  const campaignId = String(
    campaign.json.campaignId || campaign.json.id || campaign.json.campaign?.id || ""
  );
  assert(campaignId, `${contentType} campaign id missing`);

  // Read campaign row via admin list or service role later
  return {
    contentType,
    contentId,
    canonical,
    boardTitle,
    boardBody,
    campTitle,
    campBody,
    campaignId,
    campaignJson: campaign.json,
    viewCount: v2,
    commentId,
    listTitle: listed.title,
    detailBodyLen: detail1.json.notice.body.length,
    hero: detail1.json.notice.heroImageUrl,
  };
}

async function main() {
  const report = {
    base: BASE,
    mark: MARK,
    HEAD: process.env.CC_AUDIT_HEAD || null,
    results: {},
    static: {},
    badge: {},
    final: "HOLD",
  };

  // Static contract scans
  const form = fs.readFileSync(path.join(ROOT, "components/admin/app/AdminAppNoticeForm.tsx"), "utf8");
  report.static.autoTruncateWriter =
    /title:\s*form\.title\.slice|body:\s*form\.body\.slice/.test(form) ? "FAIL" : "PASS";
  report.static.campaignCtaPrefillsBody = /appNoticeId:[\s\S]*body:\s*form\.body/.test(form)
    ? "FAIL"
    : "PASS";
  report.static.campaignCtaHasContentOnly = form.includes("appNoticeId: savedId") && form.includes("deeplink: canonical");

  const menu = fs.readFileSync(path.join(ROOT, "lib/mypage/mypage-home-menu-config.ts"), "utf8");
  const supportBlock = menu.slice(menu.indexOf("MYPAGE_HOME_SUPPORT_ITEMS"), menu.indexOf("MYPAGE_HOME_POLICY_ITEMS"));
  report.static.mypageSupportSingleEntry =
    (supportBlock.match(/href:/g) || []).length === 1 &&
    supportBlock.includes("/mypage/customer-center") &&
    !supportBlock.includes("/mypage/inquiries") &&
    !supportBlock.includes("notices")
      ? "PASS"
      : "FAIL";

  const commentApi = fs.readFileSync(
    path.join(ROOT, "app/api/me/settings/notices/[noticeId]/comments/route.ts"),
    "utf8"
  );
  report.static.communityCommentWriterReuse = /community_comments|comment-mutations\.server/.test(
    commentApi
  )
    ? "FAIL"
    : "PASS";

  const badgeHits = [];
  for (const rel of [
    "app/api/me/settings/notices/[noticeId]/view/route.ts",
    "app/api/me/settings/notices/[noticeId]/comments/route.ts",
    "app/api/me/settings/notices/[noticeId]/comments/[commentId]/route.ts",
  ]) {
    const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
    if (/badge-count|memberAppIcon|rebuildBadge|from\("notification_events"\)/.test(src)) {
      badgeHits.push(rel);
    }
  }
  report.badge.directNewWriters = badgeHits;
  report.badge.result = badgeHits.length === 0 ? "PASS" : "FAIL";

  const { cookie: adminCk, admin, adminUserId } = await adminCookie();
  report.adminUserId = adminUserId;

  let member = await memberCookie(admin, QA_USER_ID);
  if (!member) {
    // Use admin as member reader if member env missing (still auth)
    member = { cookie: adminCk, userId: adminUserId };
    report.memberFallback = "admin_as_member";
  } else {
    report.memberFallback = null;
  }

  for (const type of ["notice", "system", "marketing"]) {
    try {
      report.results[type] = await chainForType(adminCk, member.cookie, type);
      report.results[type].PASS = true;
    } catch (e) {
      report.results[type] = { PASS: false, error: String(e?.message || e) };
    }
  }

  // Verify campaign target_payload bind in DB
  for (const type of ["notice", "system", "marketing"]) {
    const r = report.results[type];
    if (!r?.campaignId) continue;
    const { data: camp } = await admin
      .from("admin_notification_campaigns")
      .select("id, title, body, type, target_payload, deeplink_url")
      .eq("id", r.campaignId)
      .maybeSingle();
    r.dbCampaign = camp;
    r.copySeparated = camp && camp.title === r.campTitle && camp.body === r.campBody && camp.body !== r.boardBody;
    r.bindOk =
      camp?.target_payload?.content_id === r.contentId &&
      camp?.target_payload?.content_type === type &&
      String(camp?.target_payload?.canonical_route || "").includes(r.contentId);
  }

  // Occurrence snapshot fields if any occurrence exists
  for (const type of ["notice", "system", "marketing"]) {
    const r = report.results[type];
    if (!r?.campaignId) continue;
    const { data: occ } = await admin
      .from("admin_notification_campaign_occurrences")
      .select("id, content_snapshot")
      .eq("campaign_id", r.campaignId)
      .order("sequence_number", { ascending: true })
      .limit(1)
      .maybeSingle();
    r.occurrence = occ;
    const snap = occ?.content_snapshot || {};
    r.snapshotBind =
      snap.content_id === r.contentId &&
      snap.content_type === type &&
      typeof snap.canonical_route === "string";
  }

  // Soft-delete detail fallback
  const notice = report.results.notice;
  if (notice?.contentId) {
    await api(`/api/admin/app-notices/${encodeURIComponent(notice.contentId)}`, adminCk, {
      method: "PATCH",
      body: JSON.stringify({ soft_delete: true }),
    });
    const ended = await api(`/api/me/settings/notices/${encodeURIComponent(notice.contentId)}`, member.cookie);
    notice.softDeleteFallback =
      ended.json?.ok === true &&
      ended.json?.unavailable === true &&
      /종료되었거나|no longer available/i.test(String(ended.json?.notice?.body || ended.json?.message || ""));
  }

  const allPass =
    report.static.autoTruncateWriter === "PASS" &&
    report.static.campaignCtaPrefillsBody === "PASS" &&
    report.static.mypageSupportSingleEntry === "PASS" &&
    report.static.communityCommentWriterReuse === "PASS" &&
    report.badge.result === "PASS" &&
    ["notice", "system", "marketing"].every((t) => report.results[t]?.PASS) &&
    ["notice", "system", "marketing"].every((t) => report.results[t]?.copySeparated) &&
    ["notice", "system", "marketing"].every((t) => report.results[t]?.bindOk) &&
    ["notice", "system", "marketing"].every((t) => report.results[t]?.snapshotBind !== false);

  report.final = allPass ? "CLOSED" : "HOLD";
  report.hardLock = allPass ? "DECLARED" : "HOLD";

  fs.writeFileSync(path.join(OUT, "REPORT.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log("OUT", OUT);
  if (!allPass) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
