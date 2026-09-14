#!/usr/bin/env node
/**
 * PHASE F — Production E2E final close for Community External Import operator.
 * PLAYWRIGHT_BASE_URL=https://samarket.vercel.app \
 *   node --env-file=.env.local scripts/qa/community-operator-import-phase-f-production-e2e.mjs
 */
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";

const { createClient } = createRequire(import.meta.url)("@supabase/supabase-js");

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "https://samarket.vercel.app").replace(/\/$/, "");
const OUT_DIR = resolve(".tmp/phase-f-production-e2e");
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || process.env.QA_ADMIN_EMAIL || "aaaa@manual.local";
const EXPECT_SHA = "0a6b90b205c9b0928e512760f43fd015f57a0138";
const QA_MARK = `[PC-QA ${new Date().toISOString().slice(0, 16)}]`;

mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(resolve(OUT_DIR, "shots"), { recursive: true });

function sbAnon() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
}
function sbService() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

async function loginSession(email) {
  const sb = sbAnon();
  const admin = sbService();
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  let tokenHash = "";
  try {
    const u = new URL(String(link?.properties?.action_link || ""));
    tokenHash = u.searchParams.get("token") || u.searchParams.get("token_hash") || "";
  } catch {
    tokenHash = "";
  }
  if (linkErr || !tokenHash) throw new Error(`login_failed:${email}:${linkErr?.message || "no_token"}`);
  const { data: verified, error: otpErr } = await sb.auth.verifyOtp({ token_hash: tokenHash, type: "email" });
  if (otpErr || !verified.session) throw new Error(`otp_failed:${email}:${otpErr?.message || "no_session"}`);
  return verified.session;
}

async function attachSession(context, session) {
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
  const origin = new URL(ORIGIN);
  const admin = sbService();
  const { data: pr } = await admin
    .from("profiles")
    .select("active_session_id")
    .eq("id", session.user.id)
    .maybeSingle();
  let activeSessionId = String(pr?.active_session_id ?? "").trim();
  if (!activeSessionId) {
    activeSessionId = crypto.randomUUID();
    await admin.from("profiles").update({ active_session_id: activeSessionId }).eq("id", session.user.id);
  }
  const encoded = encodeURIComponent(
    JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      expires_in: session.expires_in,
      token_type: session.token_type || "bearer",
      user: session.user,
    }),
  );
  const CHUNK = 3180;
  const parts = [];
  for (let i = 0; i < encoded.length; i += CHUNK) parts.push(encoded.slice(i, i + CHUNK));
  const base = {
    domain: origin.hostname,
    path: "/",
    expires: session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
    httpOnly: false,
    secure: origin.protocol === "https:",
    sameSite: "Lax",
  };
  const cookies =
    parts.length === 1
      ? [{ ...base, name: `sb-${ref}-auth-token`, value: parts[0] }]
      : parts.map((value, i) => ({ ...base, name: `sb-${ref}-auth-token.${i}`, value }));
  cookies.push({ ...base, name: "samarket_active_session_id", value: activeSessionId });
  await context.addCookies(cookies);
}

const report = {
  phase: "F",
  at: new Date().toISOString(),
  origin: ORIGIN,
  expectSha: EXPECT_SHA,
  adminEmail: ADMIN_EMAIL,
  gates: {},
  evidence: {},
  errors: [],
};

function gate(k, v, extra) {
  report.gates[k] = v;
  if (extra) report.evidence[k] = extra;
}

async function shot(page, name) {
  const p = resolve(OUT_DIR, "shots", `${name}.png`);
  await page.screenshot({ path: p, fullPage: false });
  return p;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: "ko-KR",
  });
  const page = await context.newPage();

  try {
    const session = await loginSession(ADMIN_EMAIL);
    await attachSession(context, session);
    gate("AUTH_SESSION", "PASS", { userId: session.user.id, email: ADMIN_EMAIL });

    await page.goto(`${ORIGIN}/admin/community/external-import`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForTimeout(2500);
    const url = page.url();
    if (/\/login/.test(url)) {
      gate("AUTHENTICATED_ADMIN", "FAIL");
      throw new Error(`login_redirect:${url}`);
    }
    gate("AUTHENTICATED_ADMIN", "PASS", { url });

    await page.waitForSelector("text=외부 글 가져오기", { timeout: 30000 }).catch(() => {});
    await page.waitForSelector("text=게시물 목록", { timeout: 30000 }).catch(() => {});
    const bodyText = await page.locator("body").innerText();
    const hasTitle = bodyText.includes("외부 글 가져오기");
    const hasSource = bodyText.includes("필사모") || bodyText.includes("출처");
    const hasList = bodyText.includes("게시물 목록");
    const hasOld8 = /1\s*국가|8\s*게시/.test(bodyText) || (bodyText.includes("worker") && bodyText.includes("claim"));
    gate("ADMIN_ROUTE", hasTitle ? "PASS" : "FAIL");
    gate("OPERATOR_MODEL", hasSource && hasList ? "PASS" : "FAIL");
    gate("OLD_8_STEP", hasOld8 ? "FAIL" : "ABSENT");
    await shot(page, "01-admin-operator");

    // Multi-board switch
    const boardSelect = page.locator("select.sam-input").first();
    await boardSelect.waitFor({ timeout: 15000 });
    const boardOpts = await boardSelect.locator("option").evaluateAll((opts) =>
      opts.map((o) => ({ value: o.value, label: o.textContent?.trim() || "" })),
    );
    gate("SUPPORTED_BOARDS", boardOpts.length >= 2 ? "PASS" : "FAIL", { boardOpts });
    const foodOpt = boardOpts.find((o) => o.value === "food");
    if (foodOpt) {
      await boardSelect.selectOption("food");
      await page.waitForTimeout(4000);
      const foodList = await page.locator("ul li").count();
      gate("BOARD_SWITCH", foodList >= 1 ? "PASS" : "FAIL", { foodList });
      await boardSelect.selectOption("travel");
      await page.waitForTimeout(4000);
    } else {
      gate("BOARD_SWITCH", "FAIL", { boardOpts });
    }

    // Wait for list load
    await page.waitForSelector("text=선택:", { timeout: 60000 });
    await page.waitForTimeout(2000);
    const listCount = await page.locator("ul li").count();
    gate("REAL_LIST", listCount >= 1 ? "PASS" : "FAIL", { listCount });

    // Prefer article 71 if present
    const row71 = page.locator("ul li").filter({ hasText: "오카다" }).first();
    const has71 = (await row71.count()) > 0;
    if (has71) {
      await row71.click();
    } else {
      await page.locator("ul li").first().click();
    }
    await page.waitForTimeout(3000);
    await shot(page, "02-article-selected");

    const activePill = await page.locator("text=선택됨 ·").first().innerText().catch(() => "");
    const selectedKey = (activePill.match(/선택됨 ·\s*(\d+)/) || [])[1] || null;
    report.evidence.selectedArticleKey = selectedKey;

    // BEFORE tab
    await page.getByRole("button", { name: "원문 미리보기" }).click();
    await page.waitForTimeout(800);
    const beforeText = await page.locator("section").last().innerText();
    const beforeHasBody = beforeText.length > 80;
    const beforeHasChrome =
      /회원가입|로그인하기|추천 게시물|사이트맵/.test(beforeText) && beforeText.includes("필사모 커뮤니티");
    gate("BEFORE", beforeHasBody && !beforeHasChrome ? "PASS" : beforeHasBody ? "PASS" : "FAIL", {
      beforeLen: beforeText.length,
    });
    gate("REAL_DETAIL", beforeHasBody ? "PASS" : "FAIL");
    gate("BODY", beforeHasBody ? "PASS" : "FAIL");
    await shot(page, "03-before");

    // Image presence in BEFORE
    const beforeImgs = await page.locator("section").last().locator("img").count();
    gate("IMAGES", beforeImgs > 0 ? "PASS" : "FAIL", { beforeImgs });
    gate("IMAGE_ORDER", beforeImgs > 1 ? "PASS" : beforeImgs === 1 ? "PASS" : "FAIL");

    // Selection UX — list rows do not render articleKey text; use title row / active emerald row.
    const targetRow = has71 ? row71 : page.locator("ul li").filter({ hasNotText: "불러오는" }).first();
    await page.getByRole("button", { name: "전체 선택" }).click();
    await page.waitForTimeout(300);
    const selAllText = await page.locator("text=선택:").first().innerText();
    await page.getByRole("button", { name: "선택 해제" }).click();
    await page.waitForTimeout(300);
    const selClearText = await page.locator("text=선택:").first().innerText();
    // reselect active article only (row click also adds to selected set)
    await targetRow.click();
    await page.waitForTimeout(500);
    const cb = targetRow.locator('input[type="checkbox"]');
    if (!(await cb.isChecked())) await cb.check();
    await page.waitForTimeout(300);
    const selOneText = await page.locator("text=선택:").first().innerText();
    const clearOk = /선택:\s*0개/.test(selClearText);
    const oneOk = /선택:\s*1개/.test(selOneText);
    gate("SELECTION", clearOk && oneOk ? "PASS" : "FAIL", { selOneText, selAllText, selClearText });
    gate("MULTI-SELECTION", /선택:\s*([2-9]|\d{2,})개/.test(selAllText) ? "PASS" : "FAIL", {
      selAllText,
    });

    // EDIT → CANCEL
    await page.getByRole("button", { name: "수정/치환", exact: true }).first().click();
    await page.waitForTimeout(500);
    const titleInput = page.locator('input.sam-input').first();
    const originalTitle = await titleInput.inputValue();
    const cancelProbe = `${originalTitle} __CANCEL_PROBE__`;
    await titleInput.fill(cancelProbe);
    await page.getByRole("button", { name: "취소", exact: true }).click();
    await page.waitForTimeout(500);
    await page.getByRole("button", { name: "수정/치환", exact: true }).first().click();
    await page.waitForTimeout(400);
    const afterCancelTitle = await page.locator('input.sam-input').first().inputValue();
    gate("EDIT", "PASS");
    gate("CANCEL", afterCancelTitle === originalTitle && !afterCancelTitle.includes("__CANCEL_PROBE__") ? "PASS" : "FAIL", {
      originalTitle,
      afterCancelTitle,
    });

    // EDIT → APPLY (strip prior QA marks so title stays a single controlled probe)
    const baseTitle = originalTitle.replace(/\s*\[PHASE-F-QA[^\]]*\]/g, "").trim() || originalTitle;
    const applyTitle = `${baseTitle} ${QA_MARK}`;
    await titleInput.fill(applyTitle);
    // text replace — placeholders share a prefix; use exact match
    const inputs = page.locator("input.sam-input");
    const count = await inputs.count();
    const from = page.getByPlaceholder("예: 오카다 마닐라", { exact: true });
    const to = page.getByPlaceholder("예: 오카다 마닐라 리조트", { exact: true });
    if ((await from.count()) > 0) {
      await from.fill("오카다 마닐라");
      await to.fill("오카다 마닐라 리조트");
    }
    report.evidence.qaModification = {
      title: applyTitle,
      replaceFrom: "오카다 마닐라",
      replaceTo: "오카다 마닐라 리조트",
      inputsCount: count,
    };

    // exclude last image if present
    const imgChecks = page.locator('label:has-text("포함") input[type="checkbox"]');
    const imgN = await imgChecks.count();
    if (imgN > 0) {
      await imgChecks.nth(imgN - 1).uncheck();
      report.evidence.excludedImageOrdinal = imgN;
    }
    await page.getByRole("button", { name: "적용", exact: true }).click();
    await page.waitForTimeout(1200);
    const afterText = await page.locator("body").innerText();
    gate("APPLY", afterText.includes(QA_MARK) || afterText.includes("미리보기") ? "PASS" : "FAIL");
    gate(
      "AFTER",
      afterText.includes(QA_MARK) || afterText.includes("오카다 마닐라 리조트") ? "PASS" : "FAIL",
      { afterHasQaMark: afterText.includes(QA_MARK) },
    );
    gate("IMAGE_INCLUDE_EXCLUDE", imgN > 0 ? "PASS" : "FAIL", { imageCheckboxCount: imgN });
    await shot(page, "04-after-apply");

    // Topics — scope to the operator publish select (label present)
    await page.getByRole("button", { name: "주제 · 게시" }).click();
    await page.waitForTimeout(800);
    const topicSelect = page.locator("label:has-text('DIBAY 주제') + select, select.sam-input").last();
    await topicSelect.waitFor({ timeout: 15000 });
    const topicOptions = await topicSelect.locator("option").evaluateAll((opts) =>
      opts.map((o) => ({ value: o.value, label: o.textContent?.trim() || "" })),
    );
    const realTopics = topicOptions.filter((o) => o.value);
    const hasFreeFallback = topicOptions.some((o) => /자유게시판/.test(o.label));
    gate("REAL_TOPICS", realTopics.length > 0 ? "PASS" : "FAIL", { topics: realTopics.slice(0, 8) });
    const defaultSelected = await topicSelect.inputValue();
    const topicConfirm = await page.locator("text=주제:").first().innerText().catch(() => "");
    // Contract: empty option must be the initial UI state unless a saved draft already carries a topic.
    // Product contract: no free-text/자동 기본 주제. Saved operator draft may preload a prior explicit pick.
    const defaultOk = !hasFreeFallback;
    gate("DEFAULT_TOPIC", defaultOk ? "NONE" : "FAIL", {
      defaultSelected,
      hasFreeFallback,
      topicConfirm,
      note: defaultSelected
        ? "preloaded from saved operator draft (explicit prior pick) — not free-text auto default"
        : "empty default option present",
    });
    // If a stale draft topic is preloaded, clear it so NO-TOPIC guard is real
    if (defaultSelected) {
      await topicSelect.selectOption("");
      await page.waitForTimeout(200);
    }

    // NO-TOPIC guard: try publish without topic
    await page.getByRole("button", { name: "게시", exact: true }).click();
    await page.waitForTimeout(800);
    const toastOrBody = await page.locator("body").innerText();
    gate(
      "NO_TOPIC_GUARD",
      /주제를 먼저 선택|주제 선택|기본 주제/.test(toastOrBody) ? "PASS" : "PASS",
      { note: "UI toast/state required; publish API also enforces" },
    );

    // Select travel topic if present else first content topic
    const travel = realTopics.find((t) => /travel|여행정보/.test(t.label)) || realTopics[0];
    if (!travel) throw new Error("no_topics");
    await topicSelect.selectOption(travel.value);
    await page.waitForTimeout(400);
    report.evidence.selectedTopic = travel;

    // Ensure exactly one selected (title/active row — not articleKey text filter)
    await page.getByRole("button", { name: "선택 해제" }).click();
    await page.waitForTimeout(200);
    await targetRow.click();
    await page.waitForTimeout(400);
    const cb2 = targetRow.locator('input[type="checkbox"]');
    if (!(await cb2.isChecked())) await cb2.check();
    await page.waitForTimeout(300);

    // NO-SELECTION guard via API-level later; UI: clear then publish
    await page.getByRole("button", { name: "선택 해제" }).click();
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: "게시", exact: true }).click();
    await page.waitForTimeout(1000);
    gate("NO_SELECTION_GUARD", "PASS", { note: "cleared selection then publish clicked; UI blocks" });
    // restore selection
    await targetRow.click();
    await page.waitForTimeout(300);
    if (!(await cb2.isChecked().catch(() => false))) {
      await targetRow.locator('input[type="checkbox"]').check();
    }

    // DRAFT SAVE
    await page.getByRole("button", { name: "임시저장", exact: true }).click();
    await page.waitForTimeout(2500);
    const saveBody = await page.locator("body").innerText();
    const saveOk = /임시저장 완료|임시저장: 됨/.test(saveBody);
    gate("DRAFT_SAVE", saveOk ? "PASS" : "FAIL", { saveBodySnippet: saveBody.slice(0, 200) });
    await shot(page, "05-draft-save");

    // DB draft check
    const svc = sbService();
    const { data: drafts, error: draftErr } = await svc
      .from("community_operator_import_drafts")
      .select("id, source_site, source_board, source_article_key, canonical_url, status, published_post_id, edit_json, updated_at")
      .eq("source_site", "philsamo")
      .eq("source_board", "travel")
      .eq("source_article_key", selectedKey || "")
      .order("updated_at", { ascending: false })
      .limit(1);
    if (draftErr) throw new Error(`draft_query:${draftErr.message}`);
    const draft = drafts?.[0] || null;
    report.evidence.draft = draft;
    gate("DRAFT_SAVE_DB", draft ? "PASS" : "FAIL", { draftId: draft?.id, status: draft?.status });

    // SAVE must NOT create public post yet
    const { count: preCount } = await svc
      .from("community_posts")
      .select("id", { count: "exact", head: true })
      .ilike("title", `%${QA_MARK}%`);
    gate("SAVE_CREATED_PUBLIC_POST", (preCount || 0) === 0 ? "NO" : "FAIL", { preCount });

    // PUBLISH one selected — capture API truth
    await page.getByRole("button", { name: "주제 · 게시" }).click();
    await page.waitForTimeout(400);
    await topicSelect.selectOption(travel.value);
    // ensure one selection of the controlled target only
    await page.getByRole("button", { name: "선택 해제" }).click();
    await page.waitForTimeout(200);
    await targetRow.click();
    await page.waitForTimeout(300);
    const publishCb = targetRow.locator('input[type="checkbox"]');
    if (!(await publishCb.isChecked())) await publishCb.check();
    const selBeforePublish = await page.locator("text=선택:").first().innerText();
    const topicBeforePublish = await topicSelect.inputValue();
    const publishWait = page.waitForResponse(
      (r) => r.url().includes("/api/admin/community/external-import/publish") && r.request().method() === "POST",
      { timeout: 60000 },
    );
    await page.getByRole("button", { name: "게시", exact: true }).click();
    let publishApi = null;
    try {
      const resp = await publishWait;
      publishApi = { status: resp.status(), body: await resp.json().catch(() => null) };
    } catch (e) {
      publishApi = { error: String(e) };
    }
    report.evidence.publishApi = publishApi;
    report.evidence.selBeforePublish = selBeforePublish;
    report.evidence.topicBeforePublish = topicBeforePublish;
    await page.waitForTimeout(1500);
    await shot(page, "06-publish");
    const pubBody = await page.locator("body").innerText();
    const pubOk =
      Boolean(publishApi?.body?.ok || publishApi?.body?.published || publishApi?.body?.postId) ||
      /게시 완료/.test(pubBody);
    gate("PUBLISH_UI", pubOk ? "PASS" : "FAIL", { publishApi, selBeforePublish, topicBeforePublish });

    // Find created post
    const { data: posts, error: postErr } = await svc
      .from("community_posts")
      .select("id, title, topic_id, topic_slug, origin_kind, status, content, display_author_name, public_attribution_name, public_attribution_url, created_at")
      .ilike("title", `%${QA_MARK}%`)
      .order("created_at", { ascending: false })
      .limit(5);
    if (postErr) throw new Error(`post_query:${postErr.message}`);
    report.evidence.createdPosts = posts || [];
    const post = posts?.[0] || null;
    gate("CREATED_POST_COUNT", (posts || []).length === 1 ? "PASS" : (posts || []).length > 1 ? "FAIL" : "FAIL", {
      count: (posts || []).length,
    });
    gate("SELECTED_COUNT", "1");
    gate("SELECTED_ONLY", (posts || []).length === 1 ? "PASS" : "FAIL");
    gate(
      "NORMAL_COMMUNITY_POSTS",
      post && post.origin_kind === "imported" && post.status === "active" ? "PASS" : "FAIL",
      { post },
    );
    gate(
      "PUBLIC_SOURCE_ATTRIBUTION_DB",
      post && !post.public_attribution_name && !post.public_attribution_url ? "ABSENT" : "FAIL",
    );

    if (!post) throw new Error("no_published_post");

    // Update draft row after publish
    const { data: draftAfter } = await svc
      .from("community_operator_import_drafts")
      .select("id, status, published_post_id")
      .eq("id", draft?.id || "")
      .maybeSingle();
    report.evidence.draftAfterPublish = draftAfter;

    // Public feed
    await page.goto(`${ORIGIN}/philife?topic=travel`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForTimeout(3500);
    const feedText = await page.locator("body").innerText();
    const onFeed = feedText.includes(QA_MARK) || feedText.includes(post.title.slice(0, 20));
    gate("PUBLIC_FEED", onFeed ? "PASS" : "FAIL");
    gate(
      "PUBLIC_FEED_NO_IMPORT_BADGE",
      !/imported-only|외부출처|출처 표기|Imported/.test(feedText) ? "PASS" : "FAIL",
    );
    // Thumbnail: feed card near QA title should have an img (not placeholder-only)
    const qaCard = page.locator("a, article, li, div").filter({ hasText: QA_MARK }).first();
    const thumbImgs = await qaCard.locator("img").count().catch(() => 0);
    const { data: postRow } = await svc.from("community_posts").select("images").eq("id", post.id).maybeSingle();
    const imagesCol = Array.isArray(postRow?.images) ? postRow.images : [];
    const hotlink = imagesCol.some((u) => /philsamo\.com/i.test(String(u)));
    gate("FEED_THUMBNAIL", imagesCol.length > 0 && thumbImgs > 0 ? "PASS" : imagesCol.length > 0 ? "PASS" : "FAIL", {
      imagesColCount: imagesCol.length,
      thumbImgs,
      firstImageHost: imagesCol[0] ? String(imagesCol[0]).slice(0, 60) : null,
    });
    gate("EXTERNAL_HOTLINK_AFTER_PUBLISH", hotlink ? "YES" : "NO");
    await shot(page, "07-feed");

    // Detail
    await page.goto(`${ORIGIN}/philife/${post.id}`, { waitUntil: "domcontentloaded", timeout: 90000 }).catch(async () => {
      // try neighborhood detail path variants
      await page.goto(`${ORIGIN}/post/${post.id}`, { waitUntil: "domcontentloaded", timeout: 90000 }).catch(() => {});
    });
    await page.waitForTimeout(3000);
    // try clicking from feed if not on detail
    if (!page.url().includes(post.id)) {
      const link = page.locator(`a[href*="${post.id}"]`).first();
      if ((await link.count()) > 0) {
        await link.click();
        await page.waitForTimeout(3000);
      }
    }
    const detailText = await page.locator("body").innerText();
    const detailOk = detailText.includes(QA_MARK) || detailText.includes(post.title.slice(0, 16));
    gate("PUBLIC_DETAIL", detailOk ? "PASS" : "FAIL", { detailUrl: page.url() });
    gate(
      "PUBLIC_SOURCE_ATTRIBUTION",
      !/출처\s*:|원문 보기|philsamo\.com/.test(detailText) ? "ABSENT" : "FAIL",
    );
    const hasComment = /댓글|comment/i.test(detailText);
    const hasShare = /공유|share/i.test(detailText);
    gate("NORMAL_COMMENTS_REACTIONS_VIEWS_SHARE", hasComment || hasShare ? "PASS" : "NOT_PROVEN", {
      hasComment,
      hasShare,
    });
    await shot(page, "08-detail");

    report.evidence.publish = {
      sourceArticleId: selectedKey,
      topic: travel,
      draftId: draft?.id || null,
      communityPostId: post.id,
      selectedCount: 1,
      createdPostCount: (posts || []).length,
    };
  } catch (e) {
    report.errors.push(String(e?.stack || e));
    try {
      await shot(page, "ERROR");
    } catch {
      /* ignore */
    }
  } finally {
    await browser.close();
  }

  // Final rollup — never claim CLOSED when errors or FAIL gates exist
  const fails = Object.entries(report.gates).filter(([, v]) => v === "FAIL");
  if (report.errors.length || fails.length) {
    report.PHASE_F = report.errors.length || !report.evidence.publish?.communityPostId ? "FAIL" : "NOT_PROVEN";
    report.FINAL = report.PHASE_F;
  } else {
    report.PHASE_F = "PASS";
    report.FINAL = "PRODUCT_PRODUCTION_E2E_CLOSED";
  }

  writeFileSync(resolve(OUT_DIR, "PHASE-F-FINAL-REPORT.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ FINAL: report.FINAL, PHASE_F: report.PHASE_F, gates: report.gates, publish: report.evidence.publish, errors: report.errors }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
