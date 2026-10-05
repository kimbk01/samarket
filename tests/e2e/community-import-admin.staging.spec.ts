/**
 * B+ ADMIN UI E2E — runs only in .github/workflows/community-import-ui-e2e.yml.
 * A production build of the app talks to a disposable local Supabase (no production data or
 * credentials). A freshly seeded TEST admin logs in through the real login screen and real guards,
 * then drives the actual admin screens:
 * login → register site (detect, pick board) → topic + auto-collect saved → collect → inbox →
 * compare/edit → draft → publish → update (same post) → duplicate refused → community feed/detail →
 * guards (anonymous 401, cron secret) → scheduled collection never publishes.
 * Results → ui-results.json (CI annotations) and screenshots → ui-shots/ (artifact).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { expect, type Page, test } from "@playwright/test";

type Row = { site: string; check: string; result: "PASS" | "FAIL"; detail: string };
const rows: Row[] = [];
const record = (step: string, check: string, ok: boolean, detail: string) => {
  rows.push({ site: step, check, result: ok ? "PASS" : "FAIL", detail: String(detail).slice(0, 600) });
  return ok;
};
const flush = () => writeFileSync("ui-results.json", JSON.stringify(rows, null, 2));

const DB_URL = process.env.STAGING_SUPABASE_URL || "";
const DB_KEY = process.env.STAGING_SERVICE_ROLE_KEY || "";
const EMAIL = process.env.BPLUS_UI_EMAIL || "";
const PASSWORD = process.env.BPLUS_UI_PASSWORD || "";
const CRON = process.env.CRON_SECRET || "";
const API = "/api/admin/community/external-import";

mkdirSync("ui-shots", { recursive: true });
const shot = (page: Page, name: string) => page.screenshot({ path: `ui-shots/${name}.png`, fullPage: true }).catch(() => undefined);
/** Confirm the admin confirmation dialog (AdminActionConfirmDialog) with its exact action label. */
const confirmDialog = async (page: Page, label: string) => {
  const dlg = page.getByRole("dialog");
  await expect(dlg).toBeVisible({ timeout: 15_000 });
  const text = (await dlg.innerText()).replace(/\s+/g, " ");
  await dlg.getByRole("button", { name: label, exact: true }).click();
  return text;
};
/** A real button look: non-transparent background or a visible border, and horizontal padding. */
const looksLikeButton = (page: Page, name: string | RegExp) =>
  page
    .getByRole("button", { name })
    .first()
    .evaluate((el) => {
      const s = getComputedStyle(el);
      const bg = s.backgroundColor;
      const filled = bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent";
      const bordered = parseFloat(s.borderTopWidth) > 0;
      return { ok: (filled || bordered) && parseFloat(s.paddingLeft) >= 8, bg, border: s.borderTopWidth, pad: s.paddingLeft };
    });

test.describe.configure({ mode: "serial" });

test("B+ admin UI end-to-end (isolated staging)", async ({ page }) => {
  test.setTimeout(15 * 60_000);
  if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(DB_URL)) throw new Error(`refusing non-local DB: ${DB_URL}`);
  const db = createClient(DB_URL, DB_KEY, { auth: { persistSession: false } });
  const postCount = async () => (await db.from("community_posts").select("*", { count: "exact", head: true })).count ?? 0;
  await page.setViewportSize({ width: 1440, height: 1000 });

  try {
    // ── 0 guards before login ─────────────────────────────────────────────
    const anon = await page.request.get(`${API}/sources`);
    record("0 권한", "anonymous_api_denied", anon.status() === 401, `GET ${API}/sources (no session) → ${anon.status()}`);
    await page.goto("/admin/community/external-import");
    record("0 권한", "anonymous_admin_page_redirects_to_login", /\/login/.test(page.url()), `url=${page.url()}`);

    // ── 1 login through the real internal/ops login screen ───────────────
    await page.goto("/login?internal=1");
    const panel = page.getByTestId("auth-internal-login-panel");
    await panel.locator('input[type="text"]').fill(EMAIL);
    await panel.locator('input[type="password"]').fill(PASSWORD);
    await shot(page, "01-login");
    await panel.locator('button[type="submit"]').click();
    await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60_000 });
    const me = await page.request.get("/api/me/profile");
    const cookies = await page.context().cookies();
    record(
      "1 로그인",
      "test_admin_signed_in",
      me.ok() && cookies.some((c) => c.name === "samarket_active_session_id"),
      `after=${new URL(page.url()).pathname} /api/me/profile=${me.status()} sessionCookie=${cookies.some((c) => c.name === "samarket_active_session_id")}`,
    );

    // ── 2 admin page loads behind the real guard ─────────────────────────
    await page.goto("/admin/community/external-import");
    await expect(page.getByRole("heading", { name: "커뮤니티 외부 글 수집" })).toBeVisible({ timeout: 60_000 });
    await shot(page, "02-admin-inbox-empty");
    record("2 관리자 화면", "page_rendered_for_admin", true, "헤더·탭(수집함/출처·게시판/일괄 변경 규칙) 표시");

    const topics = (await (await page.request.get(`${API}/topics`)).json()) as { topics?: Array<{ id: string; slug: string; name: string }> };
    const food = topics.topics?.find((t) => t.slug === "food");
    record("2 관리자 화면", "topics_loaded", !!food, `topics=${topics.topics?.map((t) => t.name).join(", ")}`);

    // ── 3 register a new site in the wizard ──────────────────────────────
    await page.getByRole("tab", { name: "출처·게시판" }).click();
    await page.getByPlaceholder("https://example.com 또는 게시판 주소").fill("https://philsuda.com/");
    await page.getByRole("button", { name: "사이트 분석" }).click();
    const foodPick = page.getByRole("checkbox", { name: /^맛집.* 사용$/ });
    await expect(foodPick).toBeVisible({ timeout: 120_000 });
    await shot(page, "03-detect");
    record("3 등록", "detect_lists_real_boards", true, (await page.locator("table").first().innerText()).replace(/\s+/g, " ").slice(0, 400));
    await foodPick.check();
    await page.getByRole("button", { name: /^등록 \(게시판 \d+개 사용\)$/ }).click();
    await expect(page.getByText(/^등록됨:/)).toBeVisible({ timeout: 120_000 });
    const regMsg = await page.getByText(/^등록됨:/).innerText();
    await shot(page, "04-registered");
    const { data: src } = await db.from("community_operator_import_sources").select("id, engine, verification, content_policy").limit(5);
    const sourceId = String(src?.[0]?.id ?? "");
    const { data: boards } = await db.from("community_operator_import_source_boards").select("board_id, display_name, enabled").eq("source_id", sourceId);
    const foodBoard = boards?.find((b) => /맛집/.test(String(b.display_name)));
    record("3 등록", "source_and_boards_saved", !!sourceId && !!foodBoard?.enabled, `${regMsg} | db: source=${sourceId} ${JSON.stringify(src?.[0])} boards=${boards?.length} 맛집.enabled=${foodBoard?.enabled}`);

    // ── 4 board settings: topic + auto collect (persisted across reload) ─
    const reloaded = () => page.waitForResponse((r) => r.url().endsWith(`${API}/sources`) && r.request().method() === "GET", { timeout: 60_000 });
    if (food) {
      await Promise.all([reloaded(), page.getByRole("combobox", { name: /^맛집.* DIBAY 주제$/ }).selectOption(food.id)]);
    }
    await Promise.all([reloaded(), page.getByRole("checkbox", { name: /^맛집.* 자동수집$/ }).click()]);
    await page.reload();
    await page.getByRole("tab", { name: "출처·게시판" }).click();
    await page.getByTestId("import-source-toggle").first().click();
    const topicSelAfter = page.getByRole("combobox", { name: /^맛집.* DIBAY 주제$/ });
    // topics load asynchronously after the reload; wait for the stored value to be selectable
    await expect(topicSelAfter).toHaveValue(food?.id ?? "", { timeout: 30_000 }).catch(() => undefined);
    const topicAfter = await topicSelAfter.inputValue();
    const collectAfter = await page.getByRole("checkbox", { name: /^맛집.* 자동수집$/ }).isChecked();
    await shot(page, "05-board-settings");
    const dbBoard = (await db.from("community_operator_import_source_boards").select("default_topic_id, collect_enabled").eq("source_id", sourceId).eq("board_id", foodBoard?.board_id ?? "").single()).data;
    record(
      "4 게시판 설정",
      "topic_and_collect_persisted",
      topicAfter === (food?.id ?? "") && collectAfter && dbBoard?.default_topic_id === food?.id && dbBoard?.collect_enabled === true,
      `after reload: topic=${topicAfter === food?.id ? food?.name : topicAfter} collect=${collectAfter} | db: ${JSON.stringify(dbBoard)}`,
    );

    // ── 5 collect now → inbox ────────────────────────────────────────────
    const foodRow = page.getByRole("row").filter({ has: page.getByRole("checkbox", { name: /^맛집.* 자동수집$/ }) });
    await foodRow.getByRole("button", { name: "지금 수집" }).click();
    await expect(page.getByRole("tab", { name: "수집함", selected: true })).toBeVisible({ timeout: 120_000 });
    const inboxList = page.getByTestId("import-inbox-list");
    const firstItem = inboxList.locator("li button").first();
    await expect(firstItem).toBeVisible({ timeout: 60_000 });
    await shot(page, "06-inbox");
    const items = await inboxList.locator("li").count();
    const { count: inboxCount } = await db.from("community_operator_import_inbox").select("*", { count: "exact", head: true }).eq("source_site", sourceId);
    record("5 수집", "inbox_listed_in_ui_and_db", items > 0 && (inboxCount ?? 0) === items, `ui rows=${items} db inbox=${inboxCount}`);

    // ── 6 compare / edit / draft ─────────────────────────────────────────
    await firstItem.click();
    await expect(page.getByText("편집 · 게시 결과")).toBeVisible({ timeout: 90_000 });
    const titleInput = page.getByLabel("제목", { exact: true });
    const original = await titleInput.inputValue();
    await titleInput.fill(`[UI-E2E] ${original}`);
    if (food) await page.getByLabel("DIBAY 주제", { exact: true }).selectOption(food.id);
    await page.getByRole("button", { name: "임시저장" }).click();
    await expect(page.getByText("임시저장했습니다.")).toBeVisible({ timeout: 60_000 });
    await shot(page, "07-editor-compare");
    const draft = (await db.from("community_operator_import_drafts").select("status, edit_json").eq("source_site", sourceId).limit(1)).data?.[0];
    const draftTitle = (draft?.edit_json as { displayTitle?: string } | undefined)?.displayTitle ?? "";
    record("6 편집", "draft_saved_from_editor", draftTitle.startsWith("[UI-E2E]"), `status=${draft?.status} title=${draftTitle}`);

    // ── 7 publish ────────────────────────────────────────────────────────
    const before = await postCount();
    const partial = page.getByLabel(/품질 PARTIAL 확인함/);
    const publishBtn = page.getByRole("button", { name: "DIBAY에 게시" });
    if (await partial.count()) {
      const badge = await page.locator("div.shrink-0.bg-amber-50").first().innerText().catch(() => "");
      const disabledBefore = await publishBtn.isDisabled();
      const apiNoConfirm = await page.request.post(`${API}/publish`, {
        data: await (async () => {
          const ib = (await db.from("community_operator_import_drafts").select("source_site, source_board, source_article_key").eq("source_site", sourceId).limit(1)).data?.[0];
          const d = await (await page.request.get(`${API}/detail?site=${encodeURIComponent(ib!.source_site)}&board=${encodeURIComponent(ib!.source_board)}&key=${encodeURIComponent(ib!.source_article_key)}`)).json();
          return { article: d.article, edit: { ...d.edit, topicId: food?.id ?? null, topicSlug: food?.slug ?? null }, mode: "create", acceptPartial: false };
        })(),
      });
      const apiBody = await apiNoConfirm.text();
      record(
        "7 게시",
        "partial_requires_confirmation",
        disabledBefore && !apiNoConfirm.ok() && /quality_partial_needs_confirm/.test(apiBody) && (await postCount()) === before,
        `화면 표시="${badge.slice(0, 120)}" 확인 전 게시 버튼 disabled=${disabledBefore} / API(확인 없이)=${apiNoConfirm.status()} ${apiBody.slice(0, 120)}`,
      );
      await partial.check();
    }
    const looks = {
      publish: await looksLikeButton(page, "DIBAY에 게시"),
      save: await looksLikeButton(page, "임시저장"),
    };
    record("7 게시", "buttons_render_as_buttons", looks.publish.ok && looks.save.ok, JSON.stringify(looks));
    await publishBtn.click();
    const dialogText = await confirmDialog(page, "게시");
    await expect(page.getByText(/^게시 완료/)).toBeVisible({ timeout: 120_000 });
    await shot(page, "08-published");
    const post = (await db.from("community_posts").select("id, title, status, origin_kind, images, topic_slug, topic_id, content, summary, public_attribution_name, public_attribution_url").like("title", "[UI-E2E]%").maybeSingle()).data;
    record("7 게시", "post_created", !!post && post.status === "active" && post.origin_kind === "imported" && (await postCount()) === before + 1, `posts ${before}→${await postCount()} id=${post?.id}`);
    record(
      "7 게시",
      "published_to_selected_topic",
      !!post && post.topic_slug === food?.slug && post.topic_id === food?.id && dialogText.includes(food?.name ?? "\u0000"),
      `확인창="${dialogText.slice(0, 160)}" | db topic=${post?.topic_slug}/${post?.topic_id} 선택=${food?.slug}/${food?.id}`,
    );
    const inboxSummaryRow = (await db.from("community_operator_import_inbox").select("summary").eq("source_site", sourceId).limit(1)).data?.[0];
    // image markdown is the one markup the community body supports; check everything else
    const content = String(post?.content ?? "").replace(/!\[[^\]]*\]\([^)]*\)/g, "");
    record(
      "7 게시",
      "content_contract",
      !!post && !/\]\(https?:/.test(content) && !/^(#|>)/m.test(content) && !!post.public_attribution_url && !!post.public_attribution_name,
      `inline link=${/\]\(https?:/.test(content)} markup=${/^(#|>)/m.test(content)} attribution=${post?.public_attribution_name} ${post?.public_attribution_url ? "url ok" : "no url"} | summary="${String(post?.summary ?? "").slice(0, 120)}" | inbox.summary=${inboxSummaryRow?.summary ?? null}`,
    );

    // ── 8 update the same post from the editor ───────────────────────────
    await titleInput.fill(`[UI-E2E 수정] ${original}`);
    await page.getByRole("button", { name: "게시물 업데이트" }).click();
    await confirmDialog(page, "업데이트");
    await expect(page.getByText(/^업데이트 완료/)).toBeVisible({ timeout: 120_000 });
    const manage = page.getByTestId("import-post-manage");
    record("8 업데이트", "management_bar_visible", await manage.isVisible(), (await manage.innerText().catch(() => "")).replace(/\s+/g, " "));
    const updated = (await db.from("community_posts").select("id, title").like("title", "[UI-E2E%").limit(5)).data ?? [];
    record("8 업데이트", "same_post_updated", updated.length === 1 && updated[0]!.id === post?.id && updated[0]!.title.startsWith("[UI-E2E 수정]"), `rows=${updated.length} sameId=${updated[0]?.id === post?.id} title=${updated[0]?.title}`);

    // ── 9 duplicate create refused (same admin session, real API) ────────
    const link = (await db.from("community_import_post_links").select("source_site, source_board, source_article_key").eq("post_id", post?.id ?? "").single()).data;
    const detail = await (await page.request.get(`${API}/detail?site=${encodeURIComponent(link!.source_site)}&board=${encodeURIComponent(link!.source_board)}&key=${encodeURIComponent(link!.source_article_key)}`)).json();
    const beforeDup = await postCount();
    const dup = await page.request.post(`${API}/publish`, { data: { article: detail.article, edit: detail.edit, mode: "create", acceptPartial: true } });
    const dupBody = await dup.text();
    record("9 중복방지", "second_create_refused", !dup.ok() && /already_published/.test(dupBody) && (await postCount()) === beforeDup, `status=${dup.status()} body=${dupBody.slice(0, 160)} posts ${beforeDup}→${await postCount()}`);

    // ── 10 community: feed + detail as users see it ──────────────────────
    const finalTitle = updated[0]?.title ?? "";
    const detailResp = await page.goto(`/philife/${post?.id}`);
    const detailOk = await page
      .getByText(finalTitle.slice(0, 20))
      .first()
      .waitFor({ timeout: 60_000 })
      .then(() => true)
      .catch(() => false);
    await shot(page, "09-community-detail");
    const detailText = (await page.locator("main, body").first().innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 300);
    const detailFull = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
    record("10 커뮤니티", "post_detail_page", detailOk, `/philife/${post?.id} http=${detailResp?.status()} final=${new URL(page.url()).pathname} title visible=${detailOk} text="${detailText}"`);
    await page.goto("/philife");
    const feedOk = await page
      .getByText(finalTitle.slice(0, 20))
      .first()
      .waitFor({ timeout: 60_000 })
      .then(() => true)
      .catch(() => false);
    await shot(page, "10-community-feed");
    record("10 커뮤니티", "post_in_feed", feedOk, `/philife feed shows updated title=${feedOk}`);
    const plain = detailFull;
    record(
      "10 커뮤니티",
      "detail_no_raw_markup_and_source_block",
      detailOk && !/\[원문 보기[^\]]*\]\(/.test(plain) && /(출처|Source)/.test(plain),
      `rawLink=${/\[원문 보기[^\]]*\]\(/.test(plain)} sourceBlock=${/(출처|Source)/.test(plain)}`,
    );

    // ── 10b admin management from the import editor: hide → re-open → delete ──
    await page.goto("/admin/community/external-import");
    await page.getByTestId("import-inbox-list").waitFor({ timeout: 60_000 });
    await page.getByLabel("처리 상태").selectOption("published");
    // wait for the filtered list (status chip 게시됨) before opening — avoids clicking a stale row
    const pubItem = page.getByTestId("import-inbox-list").locator("li").filter({ hasText: "게시됨" }).first();
    await expect(pubItem).toBeVisible({ timeout: 60_000 });
    await pubItem.locator("button").first().click();
    const bar = page.getByTestId("import-post-manage");
    await expect(bar).toBeVisible({ timeout: 90_000 });
    const statusOf = async () => (await db.from("community_posts").select("status").eq("id", post?.id ?? "").single()).data?.status;
    await bar.getByRole("button", { name: "숨김", exact: true }).click();
    await confirmDialog(page, "숨김");
    await expect(bar.getByText("숨김", { exact: true })).toBeVisible({ timeout: 60_000 });
    const sHidden = await statusOf();
    const feedHidden = (await (await page.request.get("/api/philife/neighborhood-feed?globalFeed=1&limit=50")).json()) as { posts?: Array<{ id: string }> };
    await bar.getByRole("button", { name: "다시 공개" }).click();
    await confirmDialog(page, "공개");
    await expect(bar.getByText("공개 중")).toBeVisible({ timeout: 60_000 });
    const sActive = await statusOf();
    await bar.getByRole("button", { name: "삭제", exact: true }).click();
    await confirmDialog(page, "삭제");
    await expect(bar.getByText("삭제됨")).toBeVisible({ timeout: 60_000 });
    const sDeleted = await statusOf();
    const detailAfterDelete = await page.request.get(`/philife/${post?.id}`);
    await shot(page, "11-managed");
    record(
      "10 관리",
      "hide_reopen_delete_from_admin",
      sHidden === "hidden" && !(feedHidden.posts ?? []).some((p) => p.id === post?.id) && sActive === "active" && sDeleted === "deleted",
      `hidden=${sHidden} (feed excludes=${!(feedHidden.posts ?? []).some((p) => p.id === post?.id)}) → active=${sActive} → deleted=${sDeleted} | detail after delete http=${detailAfterDelete.status()}`,
    );

    // ── 11 scheduled collection over HTTP: auth + never publishes ────────
    const noAuth = await page.request.get("/api/cron/community-import-collect");
    const beforeCron = await postCount();
    const cron = await page.request.get("/api/cron/community-import-collect", { headers: { authorization: `Bearer ${CRON}` } });
    const cronBody = await cron.text();
    record("11 정기수집", "cron_requires_secret", noAuth.status() === 401, `no secret → ${noAuth.status()}`);
    record("11 정기수집", "cron_runs_and_never_publishes", cron.ok() && (await postCount()) === beforeCron, `status=${cron.status()} posts ${beforeCron}→${await postCount()} body=${cronBody.slice(0, 300)}`);
  } catch (e) {
    await shot(page, "zz-failure");
    record("실패", "unexpected_error", false, `${e instanceof Error ? e.message.replace(/\u001b\[[0-9;]*m/g, "").split("\n").slice(0, 6).join(" | ") : String(e)} @ ${page.url()}`);
    throw e;
  } finally {
    flush();
  }
});
