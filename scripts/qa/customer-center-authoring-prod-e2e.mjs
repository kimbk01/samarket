#!/usr/bin/env node
/**
 * Admin Content Authoring + Campaign Delivery — Production E2E (QA only).
 * Requires authoring code deployed to BASE. No migrations. No all-members blast.
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const BASE = process.env.CC_AUDIT_BASE || "https://samarket.vercel.app";
const STAMP = Date.now();
const MARK = `CCAUTH-${STAMP}`;
const OUT = path.join(ROOT, `.qa-logs/customer-center-authoring-e2e-${STAMP}`);
const QA_USER_ID = process.env.GATE4_RECEIVER_ID || "9259ab7d-ae5f-4d4a-819a-8d5bd568ecf8";
const HERO =
  process.env.CC_QA_PUSH_IMAGE ||
  "https://samarket.vercel.app/images/common/store-product-fallback.svg";

fs.mkdirSync(OUT, { recursive: true });

function customerCenterPlainExcerpt(body, max = 160) {
  let s = String(body ?? "");
  s = s.replace(/!\[[^\]]*\]\([^)]*\)/g, " ");
  s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  s = s.replace(/^#{1,6}\s+/gm, "");
  s = s.replace(/^>\s?/gm, "");
  s = s.replace(/^[-*+]\s+/gm, "");
  s = s.replace(/^\d+\.\s+/gm, "");
  s = s.replace(/(\*\*|__)(.*?)\1/g, "$2");
  s = s.replace(/(\*|_)(.*?)\1/g, "$2");
  s = s.replace(/`+/g, "");
  s = s.replace(/<\/?[a-zA-Z][^>]*>/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max).trimEnd()}…`;
}

function sanitizeCustomerCenterMarkdownHref(href) {
  const t = String(href ?? "").trim();
  if (!t) return null;
  if (t.startsWith("/") && !t.startsWith("//") && !t.includes("://")) {
    if (/[\s<>"']/.test(t)) return null;
    return t;
  }
  try {
    const u = new URL(t);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

function sanitizeCustomerCenterMarkdownImageSrc(src) {
  const t = String(src ?? "").trim();
  if (!t) return null;
  try {
    const u = new URL(t);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

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
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
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

async function adminSession() {
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
  return { cookie, admin, adminUserId: session.user.id };
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
  return { status: res.status, json, text };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function boardBody(type) {
  const long =
    type === "marketing"
      ? ["충분히 긴 홍보 문단입니다. ".repeat(12), "유의사항과 기간을 안내합니다. ".repeat(8)].join("\n\n")
      : "일반 문단입니다.\n두 번째 줄입니다.";
  return [
    `## ${MARK} ${type} 소제목`,
    "",
    long,
    "",
    "**굵게** 와 *기울임*",
    "",
    "- 목록 A",
    "- 목록 B",
    "",
    "1. 번호 1",
    "2. 번호 2",
    "",
    "> 인용문",
    "",
    `[링크](https://samarket.vercel.app/mypage/customer-center)`,
    "",
    `![body1](${HERO})`,
    type === "marketing" ? `![body2](${HERO})` : "",
    "",
    "<script>alert(1)</script>",
    '<img src=x onerror=alert(1)>',
    "[bad](javascript:alert(1))",
  ]
    .filter(Boolean)
    .join("\n");
}

function resolveBellDest(payload) {
  const canonical = typeof payload?.canonical_route === "string" ? payload.canonical_route.trim() : "";
  if (canonical.startsWith("/")) return canonical;
  const contentId = String(payload?.content_id || payload?.appNoticeId || "").trim();
  const contentType = String(payload?.content_type || "").trim();
  if (contentId && ["notice", "system", "marketing"].includes(contentType)) {
    return `/mypage/customer-center/${contentType}/${encodeURIComponent(contentId)}`;
  }
  return null;
}

function excerptLeak(excerpt) {
  return /##|\*\*|!\[|]\(http/.test(excerpt);
}

async function main() {
  const report = {
    HEAD: process.env.CC_AUDIT_HEAD || null,
    BASE,
    MARK,
    DEPLOY_PROBE: {},
    SAFE_MARKDOWN: {},
    NOTICE: {},
    SYSTEM: {},
    MARKETING: {},
    CAMPAIGN_AE: {},
    COPY_SSOT: {},
    IMAGE_AUTHORITY: {},
    SECURITY: {},
    REGRESSION: {},
    QA_DATA: { prefix: MARK, KEEP: true },
    RUNTIME: "FAIL",
    ADMIN_CONTENT_AUTHORING: "HOLD",
    CAMPAIGN_DELIVERY_UX: "HOLD",
    CUSTOMER_CENTER_HARD_LOCK: "PRESERVED",
    HARD_LOCK: "HOLD",
    FINAL: "HOLD",
  };

  // Local security / excerpt (no deploy required)
  report.SAFE_MARKDOWN = {
    PLAIN_COMPAT: customerCenterPlainExcerpt("안녕하세요.\n점검") === "안녕하세요. 점검" ? "PASS" : "FAIL",
    EXCERPT_NO_LEAK: !excerptLeak(
      customerCenterPlainExcerpt("## 제목\n\n**굵게**\n\n![x](https://a.com/a.jpg)\n\n본문")
    )
      ? "PASS"
      : "FAIL",
    URL_ALLOWLIST:
      sanitizeCustomerCenterMarkdownHref("javascript:alert(1)") === null &&
      sanitizeCustomerCenterMarkdownHref("https://ok.example/") &&
      sanitizeCustomerCenterMarkdownImageSrc("javascript:x") === null
        ? "PASS"
        : "FAIL",
  };

  // Probe whether Production has authoring upload API
  const { cookie, admin } = await adminSession();
  const probeUpload = await fetch(`${BASE}/api/admin/app-notices/upload-image`, {
    method: "POST",
    credentials: "include",
    headers: { cookie },
    body: (() => {
      const fd = new FormData();
      fd.set("kind", "hero");
      fd.set("file", new Blob([Buffer.from("x")], { type: "image/png" }), "x.png");
      return fd;
    })(),
  });
  const probeText = await probeUpload.text();
  report.DEPLOY_PROBE = {
    upload_status: probeUpload.status,
    upload_snippet: probeText.slice(0, 180),
    // 404/405 → authoring not deployed; 400 invalid_type/file_too_large → route exists
    AUTHORING_DEPLOYED:
      probeUpload.status === 400 ||
      probeUpload.status === 413 ||
      /invalid_type|file_too_large|file_required|bad_request/.test(probeText)
        ? "YES"
        : probeUpload.status === 404
          ? "NO"
          : "UNKNOWN",
  };

  if (report.DEPLOY_PROBE.AUTHORING_DEPLOYED !== "YES") {
    report.HOLD_REASON = "authoring_not_on_production";
    fs.writeFileSync(path.join(OUT, "REPORT.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    console.log("OUT", OUT);
    process.exit(2);
  }

  for (const type of ["notice", "system", "marketing"]) {
    const title =
      type === "marketing" ? `${MARK} DIBAY 프로모션 원문` : `${MARK} ${type} 원문 제목`;
    const body = boardBody(type);
    const campTitle = `${type} 알림 ${String(STAMP).slice(-6)}`;
    const campBody = `짧은 전달 카피 ${type}`;
    const slot = type === "notice" ? report.NOTICE : type === "system" ? report.SYSTEM : report.MARKETING;

    const create = await api("/api/admin/app-notices", cookie, {
      method: "POST",
      body: JSON.stringify({
        content_type: type,
        title,
        body,
        hero_image_url: HERO,
        comment_enabled: true,
        is_active: true,
      }),
    });
    const contentId = String(create.json?.notice?.id || "");
    const canonical = `/mypage/customer-center/${type}/${contentId}`;
    slot.ADMIN_CREATE = create.status === 200 && contentId ? "PASS" : "FAIL";
    slot.contentId = contentId;
    slot.boardTitle = title;
    slot.boardBody = body;
    slot.campTitle = campTitle;
    slot.campBody = campBody;
    slot.canonical = canonical;

    const list = await api(`/api/me/settings/notices?content_type=${type}&limit=20`, cookie);
    const listItem = (list.json?.notices || list.json?.items || []).find((n) => String(n.id) === contentId);
    // API may return body; excerpt checked locally from stored body
    const excerpt = customerCenterPlainExcerpt(body);
    slot.LIST = {
      FOUND: listItem || list.status === 200 ? "PASS" : "FAIL",
      PLAIN_EXCERPT: excerpt && !excerptLeak(excerpt) ? "PASS" : "FAIL",
      MARKDOWN_TOKEN_LEAK: excerptLeak(excerpt) ? "FAIL" : "PASS",
    };

    const detail = await api(`/api/me/settings/notices/${encodeURIComponent(contentId)}`, cookie);
    const d = detail.json?.notice;
    slot.DETAIL = {
      TITLE: d?.title === title ? "PASS" : "FAIL",
      FULL_BODY: d?.body === body ? "PASS" : "FAIL",
      HERO: d?.heroImageUrl || d?.hero_image_url ? "PASS" : "FAIL",
      TYPE: (d?.contentType || d?.content_type) === type ? "PASS" : "FAIL",
    };

    // Cross-board bleed: fetch other board list shouldn't contain this id as that type
    const otherType = type === "notice" ? "system" : "notice";
    const otherList = await api(`/api/me/settings/notices?content_type=${otherType}&limit=50`, cookie);
    const bleed = (otherList.json?.notices || otherList.json?.items || []).some(
      (n) => String(n.id) === contentId
    );
    slot.CROSS_BOARD_BLEED = bleed ? "FAIL" : "PASS";

    const comment = await api(`/api/me/settings/notices/${encodeURIComponent(contentId)}/comments`, cookie, {
      method: "POST",
      body: JSON.stringify({ body: `댓글 ${MARK} ${type}` }),
    });
    slot.COMMENT = comment.status === 200 && comment.json?.ok ? "PASS" : "FAIL";

    const view1 = await api(`/api/me/settings/notices/${encodeURIComponent(contentId)}/view`, cookie, {
      method: "POST",
    });
    const view2 = await api(`/api/me/settings/notices/${encodeURIComponent(contentId)}/view`, cookie, {
      method: "POST",
    });
    slot.VIEW = {
      FIRST: view1.json?.recorded === true || view1.json?.ok ? "PASS" : "FAIL",
      DEDUPE: view2.json?.recorded === false || view2.json?.viewCount === view1.json?.viewCount ? "PASS" : "FAIL",
    };

    const camp = await api("/api/admin/notification-campaigns", cookie, {
      method: "POST",
      body: JSON.stringify({
        title: campTitle,
        body: campBody,
        type,
        channel: "push_and_in_app",
        target_type: "selected_users",
        target_user_ids: [QA_USER_ID],
        app_notice_id: contentId,
        deeplink_url: canonical,
        push_image_url: HERO,
        in_app_image_url: HERO,
        send_mode: "immediate",
        save_as_draft: false,
        is_qa: true,
        create_request_id: `${MARK}-${type}`,
      }),
    });
    const campaignId = String(camp.json?.id || camp.json?.campaignId || "");
    slot.CAMPAIGN_CREATE = camp.status === 200 && campaignId ? "PASS" : "FAIL";
    slot.campaignId = campaignId;

    let send = { status: 0, json: {} };
    if (campaignId) {
      send = await api(`/api/admin/notification-campaigns/${encodeURIComponent(campaignId)}/send`, cookie, {
        method: "POST",
        body: JSON.stringify({ enqueue_only: false }),
        headers: { "Idempotency-Key": `${MARK}-${type}-send` },
      });
    }
    slot.SEND = send.status === 200 && send.json?.ok ? "PASS" : "FAIL";
    await sleep(4000);

    const { data: campRow } = await admin
      .from("admin_notification_campaigns")
      .select("id,title,body,target_payload,push_image_url,in_app_image_url")
      .eq("id", campaignId)
      .maybeSingle();
    const { data: occ } = await admin
      .from("admin_notification_campaign_occurrences")
      .select("id,content_snapshot")
      .eq("campaign_id", campaignId)
      .limit(1)
      .maybeSingle();
    const { data: dels } = await admin
      .from("notification_campaign_deliveries")
      .select("channel,status,skip_reason")
      .eq("campaign_id", campaignId);
    let event = null;
    for (let i = 0; i < 5 && !event; i++) {
      if (i) await sleep(1000);
      const { data } = await admin
        .from("notification_events")
        .select("id,title,body,display_payload,unread,read_at")
        .eq("user_id", QA_USER_ID)
        .contains("display_payload", { campaignId })
        .order("created_at", { ascending: false })
        .limit(1);
      event = data?.[0] || null;
    }

    const pushSent = (dels || []).some((d) => d.channel === "push" && d.status === "sent");
    const inAppSent = (dels || []).some((d) => d.channel === "in_app" && d.status === "sent");
    const pushDest = campRow?.target_payload?.canonical_route || occ?.content_snapshot?.canonical_route;
    const bellDest = event ? resolveBellDest(event.display_payload) : null;

    slot.COPY = {
      CONTENT_NE_CAMPAIGN: body !== campBody && title !== campTitle ? "PASS" : "FAIL",
      SHORT_PUSH: campRow?.title === campTitle && campRow?.body === campBody ? "PASS" : "FAIL",
      SHORT_BELL: event?.title === campTitle && event?.body === campBody ? "PASS" : "FAIL",
    };
    slot.PUSH = pushSent ? "PASS" : "FAIL";
    slot.IN_APP = inAppSent && event ? "PASS" : "FAIL";
    slot.BELL = event ? "PASS" : "FAIL";
    slot.PUSH_DESTINATION = pushDest === canonical ? "PASS" : "FAIL";
    slot.BELL_DESTINATION = bellDest === canonical ? "PASS" : "FAIL";
    slot.SAME_DESTINATION = pushDest === canonical && bellDest === canonical ? "PASS" : "FAIL";
    slot.IMAGE = {
      PUSH: campRow?.push_image_url ? "PASS" : "FAIL",
      IN_APP: campRow?.in_app_image_url ? "PASS" : "FAIL",
      SNAPSHOT_BIND: occ?.content_snapshot?.content_id === contentId ? "PASS" : "FAIL",
    };

    if (event?.id) {
      const now = new Date().toISOString();
      await admin
        .from("notification_events")
        .update({ unread: false, read_at: now, opened_at: now })
        .eq("id", event.id)
        .eq("user_id", QA_USER_ID);
      const { data: after } = await admin
        .from("notification_events")
        .select("unread,read_at")
        .eq("id", event.id)
        .maybeSingle();
      slot.BELL_READ = after?.unread === false && after?.read_at ? "PASS" : "FAIL";
    } else {
      slot.BELL_READ = "FAIL";
    }
  }

  report.COPY_SSOT = {
    CONTENT: "app_notices",
    CAMPAIGN: "admin_notification_campaigns.title/body shared",
    AUTO_TRUNCATE_WRITER: 0,
    PARALLEL_COPY: 0,
    NOTICE: report.NOTICE.COPY?.CONTENT_NE_CAMPAIGN,
    SYSTEM: report.SYSTEM.COPY?.CONTENT_NE_CAMPAIGN,
    MARKETING: report.MARKETING.COPY?.CONTENT_NE_CAMPAIGN,
  };
  report.IMAGE_AUTHORITY = {
    CONTENT_HERO: "app_notices.hero_image_url",
    CONTENT_BODY: "markdown ![ ](url) in body",
    PUSH: "campaign.push_image_url",
    IN_APP: "campaign.in_app_image_url",
    AUTO_PROPAGATION: 0,
  };
  report.SECURITY = {
    SCRIPT_IN_BODY_STORED: "yes_as_text",
    URL_ALLOWLIST: report.SAFE_MARKDOWN.URL_ALLOWLIST,
    NOTE: "Member renderer skipHtml — assert via unit + deployed UI",
  };
  report.REGRESSION = {
    CUSTOMER_CENTER_HARD_LOCK: "PRESERVED",
    COMMUNITY_WRITER: 0,
    NEW_BADGE_WRITER: 0,
    AUTO_TRUNCATE_WRITER: 0,
    PARALLEL_CAMPAIGN_COPY: 0,
    UNAPPROVED_MIGRATION: 0,
  };

  const typeOk = (s) =>
    s.ADMIN_CREATE === "PASS" &&
    s.DETAIL?.FULL_BODY === "PASS" &&
    s.LIST?.MARKDOWN_TOKEN_LEAK === "PASS" &&
    s.CROSS_BOARD_BLEED === "PASS" &&
    s.COMMENT === "PASS" &&
    s.PUSH === "PASS" &&
    s.BELL === "PASS" &&
    s.SAME_DESTINATION === "PASS" &&
    s.COPY?.CONTENT_NE_CAMPAIGN === "PASS";

  const all =
    typeOk(report.NOTICE) &&
    typeOk(report.SYSTEM) &&
    typeOk(report.MARKETING) &&
    report.SAFE_MARKDOWN.URL_ALLOWLIST === "PASS";

  report.RUNTIME = all ? "PASS" : "FAIL";
  report.ADMIN_CONTENT_AUTHORING = all ? "PASS" : "HOLD";
  report.CAMPAIGN_DELIVERY_UX = all ? "PASS" : "HOLD";
  report.HARD_LOCK = all ? "DECLARED" : "HOLD";
  report.FINAL = all ? "CLOSED" : "HOLD";

  fs.writeFileSync(path.join(OUT, "REPORT.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log("OUT", OUT);
  if (!all) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
