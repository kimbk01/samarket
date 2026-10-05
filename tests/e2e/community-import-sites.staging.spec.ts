/**
 * B+ REPORT L acceptance on the admin UI — the 5 site types that were never in code (REPORT J),
 * registered through the real admin screens of a production build on a disposable local Supabase:
 *   1 register without deploy · 2 real boards shown (J: 18·15·1·121·menu+manual URL)
 *   3 one article each: body / images / thumbnail / date, or the reason shown
 *   4 published to the chosen DIBAY topic; feed API topic + images match the DB
 *   5 editing + update does not add a post · 6 wrong body selector → 「구조 변경 의심」, posts untouched
 * Runs only in .github/workflows/community-import-ui-e2e.yml. Results → ui-sites-results.json.
 */
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { expect, type Page, test } from "@playwright/test";

type Row = { site: string; check: string; result: "PASS" | "FAIL"; detail: string };
const rows: Row[] = [];
const record = (site: string, check: string, ok: boolean, detail: string) => {
  rows.push({ site, check, result: ok ? "PASS" : "FAIL", detail: String(detail).slice(0, 700) });
  return ok;
};
const flush = () => writeFileSync("ui-sites-results.json", JSON.stringify(rows, null, 2));

const DB_URL = process.env.STAGING_SUPABASE_URL || "";
const DB_KEY = process.env.STAGING_SERVICE_ROLE_KEY || "";
const API = "/api/admin/community/external-import";
const shot = (page: Page, name: string) => page.screenshot({ path: `ui-shots/${name}.png`, fullPage: true }).catch(() => undefined);
const confirmDialog = async (page: Page, label: string) => {
  const dlg = page.getByRole("dialog");
  await expect(dlg).toBeVisible({ timeout: 15_000 });
  await dlg.getByRole("button", { name: label, exact: true }).click();
};

type Site = {
  key: string;
  label: string;
  url: string;
  jBoards: string;
  /** Board to pick in the wizard (falls back to the first selectable one). */
  board?: RegExp;
  topicName: RegExp;
  minBoards: number;
};

const SITES: Site[] = [
  { key: "gnuboard", label: "알이즈웰 (그누보드)", url: "https://alabang-zapote.com/madang/", jBoards: "18", board: /정보통|모아모아 뉴스|컬럼/, topicName: /필리핀 ?생할|필리핀 ?생활|필리핀 뉴스/, minBoards: 10 },
  { key: "wordpress", label: "Our Awesome Planet (WordPress)", url: "https://awesome.blog", jBoards: "15", board: /Restaurant/i, topicName: /맛집/, minBoards: 10 },
  { key: "tistory", label: "필리핀 이모저모 (티스토리)", url: "https://www.phil1234.com/", jBoards: "1", topicName: /필리핀 ?생할|필리핀 ?생활|여행정보/, minBoards: 1 },
  { key: "rss", label: "GMA News (일반 RSS)", url: "https://www.gmanetwork.com/news/rss/", jBoards: "121", board: /Nation|Metro/i, topicName: /필리핀 뉴스/, minBoards: 50 },
  { key: "html", label: "아세안익스프레스 필리핀 (RSS 없는 HTML, URL 직접 입력)", url: "https://www.aseanexpress.co.kr/news/section.html?sec_no=77", jBoards: "메뉴+수동 입력", topicName: /필리핀 뉴스/, minBoards: 1 },
];

test.describe.configure({ mode: "serial" });

test("REPORT L acceptance — 5 new site types through the admin UI", async ({ page }) => {
  test.setTimeout(45 * 60_000);
  if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(DB_URL)) throw new Error(`refusing non-local DB: ${DB_URL}`);
  const db = createClient(DB_URL, DB_KEY, { auth: { persistSession: false } });
  const postCount = async () => (await db.from("community_posts").select("*", { count: "exact", head: true })).count ?? 0;
  await page.setViewportSize({ width: 1440, height: 1000 });

  try {
    await page.goto("/login?internal=1");
    const panel = page.getByTestId("auth-internal-login-panel");
    await panel.locator('input[type="text"]').fill(process.env.BPLUS_UI_EMAIL || "");
    await panel.locator('input[type="password"]').fill(process.env.BPLUS_UI_PASSWORD || "");
    await panel.locator('button[type="submit"]').click();
    await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60_000 });
    await page.request.get("/api/me/profile");
    const topics = ((await (await page.request.get(`${API}/topics`)).json()) as { topics?: Array<{ id: string; slug: string; name: string }> }).topics ?? [];

    let gnuPost: { id: string; title: string; sourceId: string } | null = null;

    for (const site of SITES) {
      const tag = site.label;
      try {
        await page.goto("/admin/community/external-import");
        await expect(page.getByRole("heading", { name: "커뮤니티 외부 글 수집" })).toBeVisible({ timeout: 60_000 });
        await page.getByRole("tab", { name: "출처·게시판" }).click();

        // ── 1·2 register without deploy; real boards shown ──
        await page.getByPlaceholder("https://example.com 또는 게시판 주소").fill(site.url);
        await page.getByRole("button", { name: "사이트 분석" }).click();
        const wizard = page.locator("section").filter({ hasText: "새 사이트 등록" });
        const registerBtn = wizard.getByRole("button", { name: /^등록 \(게시판 \d+개 사용\)$/ });
        await expect(registerBtn.or(wizard.getByText("발견된 게시판이 없습니다."))).toBeVisible({ timeout: 150_000 });
        const boardRows = wizard.locator("table tbody tr");
        const shown = await boardRows.count();
        const names = (await boardRows.locator("td:nth-child(2) .font-medium").allInnerTexts()).slice(0, 12);
        const engine = await wizard.locator(".font-semibold").first().innerText().catch(() => "");
        await shot(page, `s-${site.key}-1-detect`);
        record(tag, "2 boards_shown", shown >= site.minBoards, `유형=${engine} 표시된 게시판 ${shown}개 (J 기준 ${site.jBoards}) : ${names.join(" | ")}`);

        // pick a board
        const boxes = wizard.getByRole("checkbox", { name: / 사용$/ });
        let picked = "";
        if (site.board) {
          const n = await boxes.count();
          for (let i = 0; i < n; i++) {
            const name = (await boxes.nth(i).getAttribute("aria-label"))?.replace(/ 사용$/, "") ?? "";
            if (site.board.test(name) && (await boxes.nth(i).isEnabled())) {
              picked = name;
              await boxes.nth(i).check();
              break;
            }
          }
        }
        if (!picked) {
          const n = await boxes.count();
          for (let i = 0; i < n; i++) {
            if (await boxes.nth(i).isEnabled()) {
              picked = (await boxes.nth(i).getAttribute("aria-label"))?.replace(/ 사용$/, "") ?? "";
              await boxes.nth(i).check();
              break;
            }
          }
        }
        await registerBtn.click();
        await expect(wizard.getByText(/^등록됨:/)).toBeVisible({ timeout: 150_000 });
        const regMsg = await wizard.getByText(/^등록됨:/).innerText();
        const src = (await db.from("community_operator_import_sources").select("id, engine, verification, content_policy").order("created_at", { ascending: false }).limit(1)).data?.[0];
        const sourceId = String(src?.id ?? "");
        const { count: boardCount } = await db.from("community_operator_import_source_boards").select("*", { count: "exact", head: true }).eq("source_id", sourceId);
        record(tag, "1 registered_in_admin_ui", !!sourceId && (boardCount ?? 0) > 0 && !!picked, `${regMsg} | 선택 게시판="${picked}" | db source=${JSON.stringify(src)} boards=${boardCount}`);

        // ── collect the picked board ──
        const topic = topics.find((t) => site.topicName.test(t.name)) ?? topics[0];
        const exact = (s: string) => new RegExp(`^${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
        const collectBox = page.getByRole("checkbox", { name: exact(`${picked} 자동수집`) });
        const row = page.getByRole("row").filter({ has: collectBox });
        await expect(row).toBeVisible({ timeout: 30_000 });
        if (topic) {
          await Promise.all([
            page.waitForResponse((r) => r.url().endsWith(`${API}/sources`) && r.request().method() === "GET", { timeout: 60_000 }),
            page.getByRole("combobox", { name: exact(`${picked} DIBAY 주제`) }).selectOption(topic.id),
          ]);
        }
        await row.getByRole("button", { name: "지금 수집" }).click();
        await expect(page.getByRole("tab", { name: "수집함", selected: true })).toBeVisible({ timeout: 150_000 });
        const inboxList = page.getByTestId("import-inbox-list");
        const firstItem = inboxList.locator("li button").first();
        await expect(firstItem).toBeVisible({ timeout: 60_000 });
        const items = await inboxList.locator("li").count();
        const thumbs = await inboxList.locator("li img").count();
        await shot(page, `s-${site.key}-2-inbox`);
        record(tag, "collect_to_inbox", items > 0, `수집함 ${items}건, 썸네일 ${thumbs}건`);

        // ── 3 one article: body / images / thumbnail / date, or reasons shown ──
        await firstItem.click();
        await expect(page.getByText("편집 · 게시 결과")).toBeVisible({ timeout: 120_000 });
        const editor = page.locator("section").filter({ hasText: "원문" }).first();
        const meta = await editor.locator("div").filter({ has: page.getByRole("link", { name: "원문 열기" }) }).last().innerText().catch(() => "");
        const reasonsBar = await page.locator("div.shrink-0.bg-amber-50").first().innerText({ timeout: 2_000 }).catch(() => "");
        const verdict = await page.locator("span").filter({ hasText: /^(FULL|PARTIAL|FAILED)$/ }).first().innerText({ timeout: 2_000 }).catch(() => "");
        const srcText = (await editor.innerText()).length;
        const srcImgs = await editor.locator("img").count();
        const dateShown = !/날짜 없음/.test(meta);
        const complete = srcText > 200 && srcImgs > 0 && dateShown;
        await shot(page, `s-${site.key}-3-editor`);
        record(
          tag,
          "3 article_fields_or_reason",
          verdict !== "FAILED" && (complete || reasonsBar.length > 0),
          `품질=${verdict || "?"} 본문≈${srcText}자 이미지=${srcImgs} 작성자·날짜="${meta.split("·").slice(0, 2).join("·").trim()}" ${reasonsBar ? `사유="${reasonsBar.slice(0, 160)}"` : "(누락 항목 없음)"}`,
        );

        // ── 4 publish to the chosen topic; feed API matches DB ──
        const titleInput = page.getByLabel("제목", { exact: true });
        const original = await titleInput.inputValue();
        await titleInput.fill(`[J-${site.key}] ${original}`);
        if (topic) await page.getByLabel("DIBAY 주제", { exact: true }).selectOption(topic.id);
        const partial = page.getByLabel(/품질 PARTIAL 확인함/);
        if (await partial.count()) await partial.check();
        const before = await postCount();
        await page.getByRole("button", { name: "DIBAY에 게시" }).click();
        await confirmDialog(page, "게시");
        await expect(page.getByText(/^(게시 완료|업데이트 완료)/).or(page.locator("p.text-rose-600"))).toBeVisible({ timeout: 150_000 });
        const pubMsg = await page.locator("p.text-emerald-700, p.text-rose-600").last().innerText().catch(() => "");
        const link = (await db.from("community_import_post_links").select("post_id").eq("source_site", sourceId).limit(1)).data?.[0];
        const post = link
          ? (await db.from("community_posts").select("id, title, topic_slug, images, status").eq("id", link.post_id).single()).data
          : null;
        const feed = (await (await page.request.get(`/api/philife/neighborhood-feed?globalFeed=1&limit=50`)).json()) as {
          posts?: Array<{ id: string; category?: string; images?: string[] }>;
        };
        const inFeed = (feed.posts ?? []).find((p) => p.id === post?.id);
        const imagesMatch = !!inFeed && (inFeed.images?.length ?? 0) === (Array.isArray(post?.images) ? post!.images.length : 0);
        record(
          tag,
          "4 published_topic_and_feed_match",
          !!post && post.status === "active" && post.topic_slug === topic?.slug && (await postCount()) === before + 1 && !!inFeed && inFeed.category === topic?.slug && imagesMatch,
          `${pubMsg} | db topic=${post?.topic_slug} images=${Array.isArray(post?.images) ? post!.images.length : "?"} | feed topic=${inFeed?.category ?? "없음"} images=${inFeed?.images?.length ?? "?"} | 선택 주제=${topic?.name}(${topic?.slug})`,
        );

        // ── 5 edit + update → same post, count unchanged ──
        const afterPub = await postCount();
        await titleInput.fill(`[J-${site.key} 수정] ${original}`);
        await page.getByRole("button", { name: "게시물 업데이트" }).click();
        await confirmDialog(page, "업데이트");
        await expect(page.getByText(/^업데이트 완료/)).toBeVisible({ timeout: 150_000 });
        const upd = post ? (await db.from("community_posts").select("id, title").eq("id", post.id).single()).data : null;
        record(tag, "5 update_no_new_post", !!upd && upd.title.startsWith(`[J-${site.key} 수정]`) && (await postCount()) === afterPub, `posts ${afterPub}→${await postCount()} title=${upd?.title}`);
        if (site.key === "gnuboard" && upd) gnuPost = { id: upd.id, title: upd.title, sourceId };
      } catch (e) {
        await shot(page, `s-${site.key}-zz-failure`);
        record(tag, "unexpected_error", false, `${e instanceof Error ? e.message.replace(/\u001b\[[0-9;]*m/g, "").split("\n").slice(0, 6).join(" | ") : String(e)} @ ${page.url()}`);
      }
      flush();
    }

    // ── 6 wrong body selector → 「구조 변경 의심」, existing post untouched ──
    if (gnuPost) {
      const tag = "알이즈웰 (그누보드)";
      try {
        const beforeCount = await postCount();
        await page.goto("/admin/community/external-import");
        await page.getByRole("tab", { name: "출처·게시판" }).click();
        const card = page.getByTestId("import-source-card").filter({ hasText: /alabang|알이즈웰/ }).first();
        await card.getByTestId("import-source-toggle").click();
        await card.getByRole("button", { name: /^수집 설정/ }).click();
        await card.getByPlaceholder("#ct, .article-body").fill("#old-layout-body");
        await Promise.all([
          page.waitForResponse((r) => r.url().endsWith(`${API}/sources`) && r.request().method() === "GET", { timeout: 60_000 }),
          card.getByRole("button", { name: "설정 저장" }).click(),
        ]);
        await Promise.all([
          page.waitForResponse((r) => r.url().endsWith(`${API}/sources`) && r.request().method() === "POST", { timeout: 150_000 }),
          card.getByRole("button", { name: "재검증" }).click(),
        ]);
        const flagged = await card.getByText(/구조 변경 의심/).first().waitFor({ timeout: 60_000 }).then(() => true).catch(() => false);
        await shot(page, "s-gnuboard-6-structure-changed");
        const boardsDb = (await db.from("community_operator_import_source_boards").select("display_name, last_error, last_verdict").eq("source_id", gnuPost.sourceId).eq("enabled", true)).data ?? [];
        const kept = (await db.from("community_posts").select("title, status").eq("id", gnuPost.id).single()).data;
        record(
          tag,
          "6 structure_change_flagged_posts_untouched",
          flagged && kept?.title === gnuPost.title && kept?.status === "active" && (await postCount()) === beforeCount,
          `화면 표시=${flagged} | db boards=${JSON.stringify(boardsDb).slice(0, 220)} | 기존 게시물 제목 유지=${kept?.title === gnuPost.title} status=${kept?.status} posts ${beforeCount}→${await postCount()}`,
        );
      } catch (e) {
        await shot(page, "s-gnuboard-6-zz-failure");
        record(tag, "6 structure_change_flagged_posts_untouched", false, `${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
      }
    } else {
      record("알이즈웰 (그누보드)", "6 structure_change_flagged_posts_untouched", false, "그누보드 게시물이 없어 실행하지 못함");
    }
  } finally {
    flush();
  }
});
