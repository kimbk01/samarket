/**
 * DIAGNOSTIC ONLY (no product change) — reproduces the production report of 2026-10-05 on the
 * isolated staging stack, with the same source article (필사모 · 필리핀 뉴스 · wr_id 473):
 *  D1 computed styles of the editor/bulk buttons vs a reference admin button
 *  D2 publish, then "게시물 업데이트" with and without an edit: network status/body + DB updated_at
 *  D3 what the community feed / detail actually show (summary source, raw markdown, 출처 block)
 *  D4 storage objects created per update (old image copies left behind?)
 * Results → diagnose-results.json (CI annotations).
 */
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { expect, type Page, test } from "@playwright/test";

type Row = { site: string; check: string; result: "PASS" | "FAIL"; detail: string };
const rows: Row[] = [];
// Diagnostics record observations; "PASS" only means the observation was captured.
const note = (step: string, check: string, detail: string) => rows.push({ site: step, check, result: "PASS", detail: String(detail).slice(0, 900) });
const flush = () => writeFileSync("diagnose-results.json", JSON.stringify(rows, null, 2));

const DB_URL = process.env.STAGING_SUPABASE_URL || "";
const DB_KEY = process.env.STAGING_SERVICE_ROLE_KEY || "";
const API = "/api/admin/community/external-import";

async function styleOf(page: Page, name: RegExp) {
  const b = page.getByRole("button", { name }).first();
  if (!(await b.count())) return "not found";
  return b.evaluate((el) => {
    const s = getComputedStyle(el);
    return JSON.stringify({
      cls: el.className,
      bg: s.backgroundColor,
      color: s.color,
      border: `${s.borderTopWidth} ${s.borderTopStyle} ${s.borderTopColor}`,
      pad: `${s.paddingTop} ${s.paddingLeft}`,
      h: (el as HTMLElement).offsetHeight,
      disabled: (el as HTMLButtonElement).disabled,
      vars: {
        primary: s.getPropertyValue("--sam-primary").trim(),
        primarySoft: s.getPropertyValue("--sam-primary-soft").trim(),
        minH: s.getPropertyValue("--sam-button-min-height").trim(),
      },
    });
  });
}

test("diagnose production report (isolated staging)", async ({ page }) => {
  test.setTimeout(20 * 60_000);
  if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(DB_URL)) throw new Error(`refusing non-local DB: ${DB_URL}`);
  const db = createClient(DB_URL, DB_KEY, { auth: { persistSession: false } });
  await page.setViewportSize({ width: 1536, height: 1000 });
  const responses: string[] = [];
  page.on("response", async (r) => {
    if (r.url().includes(`${API}/publish`) || r.url().includes(`${API}/drafts`)) {
      responses.push(`${r.request().method()} ${new URL(r.url()).pathname} ${r.status()} ${(await r.text().catch(() => "")).slice(0, 220)}`);
    }
  });
  page.on("console", (m) => {
    if (m.type() === "error") responses.push(`console.error ${m.text().slice(0, 200)}`);
  });

  try {
    await page.goto("/login?internal=1");
    const panel = page.getByTestId("auth-internal-login-panel");
    await panel.locator('input[type="text"]').fill(process.env.BPLUS_UI_EMAIL || "");
    await panel.locator('input[type="password"]').fill(process.env.BPLUS_UI_PASSWORD || "");
    await panel.locator('button[type="submit"]').click();
    await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60_000 });
    await page.request.get("/api/me/profile");
    const topics = ((await (await page.request.get(`${API}/topics`)).json()) as { topics?: Array<{ id: string; slug: string; name: string }> }).topics ?? [];
    const news = topics.find((t) => t.slug === "news") ?? topics[0];

    // register 필사모 with its 뉴스 board through the real screen
    await page.goto("/admin/community/external-import");
    await page.getByRole("tab", { name: "출처·게시판" }).click();
    await page.getByPlaceholder("https://example.com 또는 게시판 주소").fill("https://philsamo.com/");
    await page.getByRole("button", { name: "사이트 분석" }).click();
    const wizard = page.locator("section").filter({ hasText: "새 사이트 등록" });
    const reg = wizard.getByRole("button", { name: /^등록 \(게시판 \d+개 사용\)$/ });
    await expect(reg).toBeVisible({ timeout: 150_000 });
    const boxes = wizard.getByRole("checkbox", { name: / 사용$/ });
    const names: string[] = [];
    for (let i = 0; i < (await boxes.count()); i++) names.push((await boxes.nth(i).getAttribute("aria-label")) ?? "");
    const newsName = names.find((n) => /뉴스/.test(n))?.replace(/ 사용$/, "") ?? "";
    note("D0 setup", "boards", `${names.join(" | ")} → picked "${newsName}"`);
    if (newsName) await wizard.getByRole("checkbox", { name: `${newsName} 사용`, exact: true }).check();
    await reg.click();
    await expect(wizard.getByText(/^등록됨:/)).toBeVisible({ timeout: 150_000 });
    const sourceId = String((await db.from("community_operator_import_sources").select("id").order("created_at", { ascending: false }).limit(1)).data?.[0]?.id ?? "");

    // D1 — bulk dock + editor buttons, reference: the wizard's primary "사이트 분석" button style
    note("D1 버튼 스타일", "reference 사이트 분석", await styleOf(page, /^사이트 분석$/));
    const row = page.getByRole("row").filter({ has: page.getByRole("checkbox", { name: `${newsName} 자동수집`, exact: true }) });
    if (news) await page.getByRole("combobox", { name: `${newsName} DIBAY 주제`, exact: true }).selectOption(news.id);
    await row.getByRole("button", { name: "지금 수집" }).click();
    await expect(page.getByRole("tab", { name: "수집함", selected: true })).toBeVisible({ timeout: 150_000 });
    const list = page.getByTestId("import-inbox-list");
    await expect(list.locator("li button").first()).toBeVisible({ timeout: 60_000 });
    const keys = (await db.from("community_operator_import_inbox").select("source_article_key, title").eq("source_site", sourceId)).data ?? [];
    const target = keys.find((k) => k.source_article_key === "473") ?? keys[0];
    note("D0 setup", "target", `wr_id 473 present=${keys.some((k) => k.source_article_key === "473")} using=${target?.source_article_key} "${target?.title}"`);
    await list.getByRole("checkbox", { name: "선택" }).first().check();
    note("D1 버튼 스타일", "bulk 일괄 게시", await styleOf(page, /^일괄 게시/));
    note("D1 버튼 스타일", "bulk 선택 해제", await styleOf(page, /^선택 해제$/));
    await page.getByRole("button", { name: "선택 해제" }).click();
    await list.locator("li").filter({ hasText: target?.title?.slice(0, 12) ?? "" }).first().locator("button").first().click();
    await expect(page.getByText("편집 · 게시 결과")).toBeVisible({ timeout: 120_000 });
    note("D1 버튼 스타일", "editor 임시저장", await styleOf(page, /^임시저장$/));
    note("D1 버튼 스타일", "editor DIBAY에 게시", await styleOf(page, /^DIBAY에 게시$/));
    note("D1 버튼 스타일", "editor 미리보기 갱신", await styleOf(page, /^미리보기 갱신$/));
    await page.screenshot({ path: "ui-shots/d1-editor.png", fullPage: true }).catch(() => undefined);

    // D2 — publish then update (no edit), then update (with edit)
    if (news) await page.getByLabel("DIBAY 주제", { exact: true }).selectOption(news.id);
    const partial = page.getByLabel(/품질 PARTIAL 확인함/);
    if (await partial.count()) await partial.check();
    await page.getByRole("button", { name: "DIBAY에 게시" }).click();
    await expect(page.getByText(/^(게시 완료|업데이트 완료)/).or(page.locator("p.text-rose-600"))).toBeVisible({ timeout: 150_000 });
    const link = (await db.from("community_import_post_links").select("post_id").eq("source_site", sourceId).limit(1)).data?.[0];
    const p0 = link ? (await db.from("community_posts").select("title, updated_at, summary, content, images").eq("id", link.post_id).single()).data : null;
    note("D2 게시", "after publish", `msg="${await page.locator("p.text-emerald-700, p.text-rose-600").last().innerText().catch(() => "")}" post=${link?.post_id} updated_at=${p0?.updated_at}`);
    note("D2 게시", "update button state", await styleOf(page, /^게시물 업데이트$/));

    await page.getByRole("button", { name: "게시물 업데이트" }).click();
    await page.waitForTimeout(500);
    await expect(page.getByRole("button", { name: /^게시물 업데이트$/ })).toBeVisible({ timeout: 150_000 });
    const p1 = link ? (await db.from("community_posts").select("title, updated_at").eq("id", link.post_id).single()).data : null;
    note("D2 업데이트(수정 없음)", "result", `msg="${await page.locator("p.text-emerald-700, p.text-rose-600").last().innerText().catch(() => "")}" updated_at ${p0?.updated_at} → ${p1?.updated_at}`);

    const title = page.getByLabel("제목", { exact: true });
    await title.fill(`[진단] ${await title.inputValue()}`);
    await page.getByRole("button", { name: "게시물 업데이트" }).click();
    await page.waitForTimeout(500);
    await expect(page.getByRole("button", { name: /^게시물 업데이트$/ })).toBeVisible({ timeout: 150_000 });
    const p2 = link ? (await db.from("community_posts").select("title, updated_at").eq("id", link.post_id).single()).data : null;
    note("D2 업데이트(제목 수정)", "result", `msg="${await page.locator("p.text-emerald-700, p.text-rose-600").last().innerText().catch(() => "")}" title="${p2?.title}" updated_at → ${p2?.updated_at}`);
    note("D2 네트워크", "publish/drafts responses", responses.join(" || "));

    // D3 — what users see
    const det = await db.from("community_operator_import_inbox").select("summary").eq("source_site", sourceId).eq("source_article_key", target?.source_article_key ?? "").single();
    note("D3 내용", "stored", `post.summary="${p0?.summary?.slice(0, 160)}" | content="${p0?.content?.slice(0, 300).replace(/\n/g, "⏎")}" | inbox.summary=${det.data?.summary}`);
    await page.goto(`/philife/${link?.post_id}`);
    await page.waitForTimeout(4000);
    const body = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    note("D3 상세", "raw markdown / 출처", `rawLink=${/\[원문 보기[^\]]*\]\(https?:/.test(body)} 출처블록=${/출처/.test(body)} text="${body.slice(0, 500)}"`);
    await page.screenshot({ path: "ui-shots/d3-detail.png", fullPage: true }).catch(() => undefined);

    // D4 — storage objects: one update created new copies?
    const { data: objs } = await db.storage.from("post-images").list(`${(await db.from("community_import_principal").select("user_id").single()).data?.user_id}/community/import`, { limit: 100 });
    const { count: imgRows } = await db.from("community_post_images").select("*", { count: "exact", head: true }).eq("post_id", link?.post_id ?? "");
    note("D4 저장소", "objects vs rows", `storage objects(original+derivatives) in import folder=${objs?.length} image rows for post=${imgRows} after 1 publish + 2 updates`);
  } catch (e) {
    note("실패", "unexpected_error", `${e instanceof Error ? e.message.split("\n")[0] : String(e)} @ ${page.url()} | ${responses.join(" || ")}`);
  } finally {
    flush();
  }
});
