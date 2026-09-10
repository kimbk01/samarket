/**
 * STEP3 Admin TEST CRAWL runtime close — browser click + no-write proof.
 * Seeds Source/Board (REVIEW_REQUIRED). Does not insert community_posts / post_links / media.
 */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = Number(process.env.STEP3_PORT || 3471);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const ARTIFACT = resolve(process.cwd(), "tests/e2e/.artifacts/community-crawl-step3-admin-runtime-close.json");
const TOPIC_ID = "e0914e34-e44c-42f7-adcc-8f6cf8c7843a";
const SOURCE_NAME = "Travel Philippines — Department of Tourism";
const BASE_URL = "https://app.philippines.travel";
const LIST_URL = "https://app.philippines.travel/articles/category/see-and-do";
const BOARD_NAME = "See & Do";
const TEMP_EMAIL = `step3-admin-runtime-${Date.now()}@dibay.internal`;
const TEMP_PASS = `Step3Qa!${randomUUID().slice(0, 8)}`;

const ADAPTER_CONFIG = {
  listItemSelector: "div.css-79elbk",
  detailLinkSelector: 'a[href^="../../articles/"]',
  titleSelector: "h2.css-1ceovz4",
  contentSelector: "div.css-14tykrn:has(p.css-1z9snp)",
  authorSelector: "h2.css-1csuiqk",
  dateSelector: "p.css-1dgfwg3",
};

function loadEnv() {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (k && process.env[k] == null) process.env[k] = v;
  }
}

async function waitReady() {
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(`${ORIGIN}/login`, { redirect: "manual" });
      if (r.status > 0 && r.status < 500) return true;
    } catch {
      /* */
    }
    await sleep(2000);
  }
  return false;
}

async function countExact(sb, table) {
  const { count, error } = await sb.from(table).select("*", { count: "exact", head: true });
  if (error) return { count: null, error: error.message };
  return { count, error: null };
}

async function main() {
  loadEnv();
  mkdirSync(resolve(process.cwd(), "tests/e2e/.artifacts"), { recursive: true });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !serviceKey || !anonKey) throw new Error("missing supabase env");
  const ref = url.match(/https:\/\/([^.]+)\./)?.[1];
  const sb = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const report = {
    step: "STEP3_ADMIN_RUNTIME_CLOSE",
    head: null,
    checks: {},
    finishedAt: null,
  };

  let tempId = null;
  let memId = null;
  let sourceId = null;
  let boardId = null;
  let createdSource = false;
  let createdBoard = false;
  let child = null;

  try {
    const { data: topic } = await sb
      .from("community_topics")
      .select("id, name")
      .eq("id", TOPIC_ID)
      .maybeSingle();
    if (!topic?.id) throw new Error("topic 여행정보 not found");

    // Reuse existing Travel Philippines source if present.
    const { data: existingSources } = await sb
      .from("community_crawl_sources")
      .select("*")
      .ilike("base_url", "%app.philippines.travel%")
      .limit(5);
    let source = (existingSources || [])[0] || null;
    if (!source) {
      const { data, error } = await sb
        .from("community_crawl_sources")
        .insert({
          name: SOURCE_NAME,
          base_url: BASE_URL,
          status: "ACTIVE",
          crawler_type: "generic_html",
          policy_status: "REVIEW_REQUIRED",
          updated_at: new Date().toISOString(),
        })
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      source = data;
      createdSource = true;
    } else {
      const { data, error } = await sb
        .from("community_crawl_sources")
        .update({
          name: SOURCE_NAME,
          status: "ACTIVE",
          policy_status: "REVIEW_REQUIRED",
          updated_at: new Date().toISOString(),
        })
        .eq("id", source.id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      source = data;
    }
    sourceId = source.id;
    if (source.policy_status !== "REVIEW_REQUIRED") throw new Error("policy must stay REVIEW_REQUIRED");

    const { data: existingBoards } = await sb
      .from("community_crawl_boards")
      .select("*")
      .eq("source_id", sourceId)
      .ilike("list_url", "%see-and-do%")
      .limit(5);
    let board = (existingBoards || [])[0] || null;
    if (!board) {
      const { data, error } = await sb
        .from("community_crawl_boards")
        .insert({
          source_id: sourceId,
          name: BOARD_NAME,
          list_url: LIST_URL,
          dibay_topic_id: TOPIC_ID,
          enabled: true,
          crawl_mode: "generic_html",
          adapter_config: ADAPTER_CONFIG,
          update_policy: "CREATE_ONLY",
          author_policy: "SOURCE_AUTHOR",
          author_config: {},
          date_policy: "SOURCE_DATE",
          date_config: {},
          view_policy: "SOURCE_VIEW",
          view_config: {},
          schedule_enabled: false,
          crawl_interval_minutes: null,
          max_pages: 1,
          max_posts: 5,
          updated_at: new Date().toISOString(),
        })
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      board = data;
      createdBoard = true;
    } else {
      const { data, error } = await sb
        .from("community_crawl_boards")
        .update({
          name: BOARD_NAME,
          list_url: LIST_URL,
          dibay_topic_id: TOPIC_ID,
          adapter_config: ADAPTER_CONFIG,
          author_policy: "SOURCE_AUTHOR",
          date_policy: "SOURCE_DATE",
          view_policy: "SOURCE_VIEW",
          max_pages: 1,
          max_posts: 5,
          enabled: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", board.id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      board = data;
    }
    boardId = board.id;

    report.checks.SOURCE_REGISTRY = {
      pass: true,
      detail: { sourceId, name: source.name, policy: source.policy_status, createdSource },
    };
    report.checks.BOARD_REGISTRY = {
      pass: true,
      detail: { boardId, name: board.name, topicId: TOPIC_ID, topicName: topic.name, createdBoard },
    };
    report.checks.BOARD_CONFIG = {
      pass: Boolean(board.adapter_config?.detailLinkSelector && board.adapter_config?.titleSelector),
      detail: board.adapter_config,
    };

    const { data: created } = await sb.auth.admin.createUser({
      email: TEMP_EMAIL,
      password: TEMP_PASS,
      email_confirm: true,
    });
    tempId = created.user.id;
    await sb.from("profiles").upsert({ id: tempId, nickname: "step3_admin_runtime" });

    // Best-effort profile completion via service role (no password string in command).
    const { data: donor } = await sb
      .from("profiles")
      .select(
        "terms_accepted_at, privacy_accepted_at, terms_version, privacy_version, onboarding_completed_at"
      )
      .eq("id", "11111111-1111-1111-1111-111111111111")
      .maybeSingle();
    await sb
      .from("profiles")
      .update({
        phone_verified: true,
        phone_verified_at: new Date().toISOString(),
        terms_accepted_at: donor?.terms_accepted_at ?? new Date().toISOString(),
        privacy_accepted_at: donor?.privacy_accepted_at ?? new Date().toISOString(),
        terms_version: donor?.terms_version ?? null,
        privacy_version: donor?.privacy_version ?? null,
        onboarding_completed_at: donor?.onboarding_completed_at ?? new Date().toISOString(),
        username_confirmed: true,
      })
      .eq("id", tempId);

    const { data: mem } = await sb
      .from("admin_memberships")
      .insert({ user_id: tempId, role: "admin", status: "active" })
      .select("id")
      .single();
    memId = mem.id;

    const before = {
      posts: await countExact(sb, "community_posts"),
      links: await countExact(sb, "community_crawl_post_links"),
      images: await countExact(sb, "community_post_images"),
    };

    child = spawn("npx", ["next", "dev", "-p", String(PORT), "-H", "127.0.0.1"], {
      cwd: process.cwd(),
      env: { ...process.env, PORT: String(PORT) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (!(await waitReady())) throw new Error("next not ready");

    const anon = createClient(url, anonKey, { auth: { persistSession: false } });
    const { data: signed, error: sErr } = await anon.auth.signInWithPassword({
      email: TEMP_EMAIL,
      password: TEMP_PASS,
    });
    if (sErr || !signed?.session) throw new Error(sErr?.message || "signin failed");
    const session = signed.session;
    const cookieValue = encodeURIComponent(
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
    for (let i = 0; i < cookieValue.length; i += CHUNK) parts.push(cookieValue.slice(i, i + CHUNK));

    const { data: pr } = await sb
      .from("profiles")
      .select("active_session_id")
      .eq("id", tempId)
      .maybeSingle();
    let activeSessionId = String(pr?.active_session_id ?? "").trim();
    if (!activeSessionId) {
      activeSessionId = randomUUID();
      await sb.from("profiles").update({ active_session_id: activeSessionId }).eq("id", tempId);
    }

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const cookieBase = {
      domain: "127.0.0.1",
      path: "/",
      expires: session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
      httpOnly: false,
      secure: false,
      sameSite: "Lax",
    };
    const authCookies =
      parts.length === 1
        ? [{ ...cookieBase, name: `sb-${ref}-auth-token`, value: parts[0] }]
        : parts.map((value, i) => ({ ...cookieBase, name: `sb-${ref}-auth-token.${i}`, value }));
    await context.addCookies([
      ...authCookies,
      { ...cookieBase, name: "samarket_active_session_id", value: activeSessionId },
    ]);
    const page = await context.newPage();

    // Warm compile + session
    await page.goto(`${ORIGIN}/admin/community`, { waitUntil: "domcontentloaded", timeout: 180000 });
    await page.waitForTimeout(3000);
    await page.goto(`${ORIGIN}/admin/community/external-sources`, {
      waitUntil: "domcontentloaded",
      timeout: 180000,
    });
    await page.waitForTimeout(10000);
    const me = await page.request.get(`${ORIGIN}/api/me/settings`);
    const overview = await page.request.get(`${ORIGIN}/api/admin/community/crawl/overview`);
    const overviewJson = await overview.json().catch(() => ({}));
    const bodyText = await page.locator("body").innerText();
    const redirectedLogin = /\/login|auth_required/i.test(page.url());
    const hasSource = bodyText.includes("Travel Philippines") || bodyText.includes(SOURCE_NAME);
    const hasBoard = bodyText.includes("See & Do") || bodyText.includes(BOARD_NAME);
    const hasTopic = bodyText.includes("여행정보") || bodyText.includes(topic.name);
    const hasPolicy =
      /REVIEW_REQUIRED|정책 검토|Review required/i.test(bodyText) ||
      overviewJson?.sources?.some?.((s) => s.policy_status === "REVIEW_REQUIRED");
    const overflow1440 = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2
    );

    report.checks.ADMIN_PAGE = {
      pass: me.ok() && overview.ok() && !redirectedLogin && hasSource && hasBoard,
      detail: {
        redirectedLogin,
        meStatus: me.status(),
        overviewStatus: overview.status(),
        overviewOk: overviewJson?.ok === true,
        sourceCount: overviewJson?.sources?.length ?? null,
        boardCount: overviewJson?.boards?.length ?? null,
        hasSource,
        hasBoard,
        hasTopic,
        hasPolicy,
        url: page.url(),
        overflow1440,
        bodySnippet: bodyText.slice(0, 500),
      },
    };
    if (!report.checks.ADMIN_PAGE.pass) {
      throw new Error(`ADMIN_PAGE fail: ${JSON.stringify(report.checks.ADMIN_PAGE.detail)}`);
    }

    // Prefer board-row manage near See & Do.
    const boardRow = page.locator("div").filter({ hasText: BOARD_NAME }).filter({ hasText: /관리|Manage/i }).first();
    const manageBtn = boardRow.getByRole("button", { name: /관리|Manage/i }).first();
    if (!(await manageBtn.count())) {
      // fallback: any manage
      await page.getByRole("button", { name: /관리|Manage/i }).first().click({ timeout: 15000 });
    } else {
      await manageBtn.click({ timeout: 15000 });
    }
    await page.waitForTimeout(1000);
    const testBtn = page.getByRole("button", { name: /테스트 수집|Test crawl/i }).first();
    const manualBtn = page.getByRole("button", { name: /지금 수집|Collect now|Manual/i }).first();
    const testEnabled = await testBtn.isEnabled();
    const manualDisabled = await manualBtn.isDisabled();
    report.checks.TEST_CRAWL_CTA = {
      pass: testEnabled && manualDisabled,
      detail: { testEnabled, manualDisabled },
    };

    await testBtn.click();
    // loading modal
    const loadingVisible = await page
      .getByText(/테스트 수집 중|Running test crawl/i)
      .first()
      .isVisible()
      .catch(() => false);

    // Wait for preview result (network can take a bit)
    await page.waitForSelector("text=/SUCCESS|PARTIAL|FAILED|성공|부분/", { timeout: 120000 }).catch(() => null);
    await page.waitForTimeout(2000);

    const previewRoot = page.locator('[role="dialog"]').last();
    const previewText = (await previewRoot.innerText().catch(() => "")) || (await page.locator("body").innerText());
    const previewCount = await previewRoot.locator("article").count().catch(() => 0);
    const hasTitle = /Cebu Province|Lapu-Lapu|Manila|Boracay|Batangas|Baguio|Bohol/i.test(previewText);
    const hasAuthor = /Travel Philippines/.test(previewText);
    const hasViewsMissing = /제공되지 않음|Not provided|조회수/.test(previewText);
    const hasRepNone = /대표 이미지: 없음|Representative image: none/.test(previewText);
    const hasAbsUrl = /https:\/\/app\.philippines\.travel\/articles\//.test(previewText);
    const hasRelativeLeak = /\.\.\/\.\.\/articles\//.test(previewText);
    const hasChromeLeak = /All rights reserved|Download the app/i.test(previewText);
    const statusMatch = previewText.match(/\b(SUCCESS|PARTIAL|FAILED)\b/);

    report.checks.TEST_CRAWL_LOADING = { pass: loadingVisible || previewCount > 0, detail: { loadingVisible } };
    report.checks.LIVE_PREVIEW = {
      pass: previewCount >= 3 && previewCount <= 5 && hasTitle && hasAuthor && hasAbsUrl && !hasRelativeLeak,
      detail: {
        previewCount,
        hasTitle,
        hasAuthor,
        hasViewsMissing,
        hasRepNone,
        hasAbsUrl,
        hasRelativeLeak,
        hasChromeLeak,
        status: statusMatch?.[1] ?? null,
      },
    };

    // Overflow at 1280
    await page.setViewportSize({ width: 1280, height: 800 });
    const overflow1280 = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2
    );
    report.checks.ADMIN_UX = {
      pass: !overflow1440 && !overflow1280 && !hasChromeLeak && hasViewsMissing && hasRepNone,
      detail: { overflow1440, overflow1280, hasChromeLeak, hasViewsMissing, hasRepNone },
    };

    await browser.close();

    const after = {
      posts: await countExact(sb, "community_posts"),
      links: await countExact(sb, "community_crawl_post_links"),
      images: await countExact(sb, "community_post_images"),
    };
    const deltas = {
      posts: (after.posts.count ?? -1) - (before.posts.count ?? 0),
      links: (after.links.count ?? -1) - (before.links.count ?? 0),
      images: (after.images.count ?? -1) - (before.images.count ?? 0),
    };
    report.checks.NO_WRITE = {
      pass: deltas.posts === 0 && deltas.links === 0 && deltas.images === 0,
      detail: { before, after, deltas },
    };

    const { data: runs } = await sb
      .from("community_crawl_runs")
      .select("*")
      .eq("board_id", boardId)
      .eq("run_kind", "TEST")
      .order("started_at", { ascending: false })
      .limit(1);
    const latest = runs?.[0] || null;
    report.checks.RUN_HISTORY = {
      pass: Boolean(latest && latest.run_kind === "TEST" && latest.inserted_count === 0),
      detail: latest
        ? {
            id: latest.id,
            status: latest.status,
            run_kind: latest.run_kind,
            fetched_count: latest.fetched_count,
            inserted_count: latest.inserted_count,
            failed_count: latest.failed_count,
          }
        : null,
    };

    // Confirm policy still REVIEW_REQUIRED
    const { data: srcAfter } = await sb
      .from("community_crawl_sources")
      .select("policy_status")
      .eq("id", sourceId)
      .single();
    report.checks.SOURCE_POLICY = {
      pass: srcAfter?.policy_status === "REVIEW_REQUIRED",
      detail: srcAfter?.policy_status,
    };
  } catch (e) {
    report.checks.RUNTIME_ERROR = {
      pass: false,
      detail: e instanceof Error ? e.message : String(e),
    };
    report.final = "PARTIAL";
    report.finishedAt = new Date().toISOString();
    writeFileSync(ARTIFACT, JSON.stringify(report, null, 2));
    throw e;
  } finally {
    try {
      if (memId) await sb.from("admin_memberships").delete().eq("id", memId);
    } catch {
      /* */
    }
    try {
      if (tempId) await sb.auth.admin.deleteUser(tempId);
    } catch {
      /* */
    }
    // Keep Source/Board registry (product fixture for Owner). Do not delete.
    if (child) {
      child.kill("SIGTERM");
      await sleep(800);
      try {
        child.kill("SIGKILL");
      } catch {
        /* */
      }
    }
  }

  const required = [
    "SOURCE_REGISTRY",
    "BOARD_REGISTRY",
    "BOARD_CONFIG",
    "ADMIN_PAGE",
    "TEST_CRAWL_CTA",
    "LIVE_PREVIEW",
    "ADMIN_UX",
    "NO_WRITE",
    "SOURCE_POLICY",
  ];
  const closed = required.every((k) => report.checks[k]?.pass);
  report.final = closed ? "CLOSED" : "PARTIAL";
  report.finishedAt = new Date().toISOString();
  writeFileSync(ARTIFACT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ final: report.final, checks: report.checks }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
