/**
 * 관리자 재설계 R10 「화면 확인」 — 사이드바 메뉴 leaf 전부를 1024×768 · 1280×800 에서 열어 잘림을 측정한다.
 *
 * 판정 (화면마다·크기마다):
 *  - 진입: 접근 거부·가로 전용 안내·오류 경계 없이 본문(`[data-admin-main-content]`)이 뜬다.
 *  - 가로 넘침: 문서·본문이 가로로 넘치지 않는다 (scrollWidth ≤ clientWidth).
 *  - 잘림: 본문 안 글자·버튼이 overflow hidden 조상 밖으로 나가거나, 말줄임(…) 없이 잘린다.
 *    - 표처럼 가로 스크롤 컨테이너(overflow-x auto/scroll) 안은 잘림이 아니라 스크롤 — 제외.
 *    - `truncate`·`text-ellipsis`·`line-clamp` 처럼 의도한 말줄임은 제외.
 * 결과: `R10_OUT_DIR`(기본 `.qa-logs/admin-r10`)에 화면별 스크린샷 + `report.json`. 잘림 0 이어야 통과.
 *
 * 실행 (관리자 계정 필요 — 운영 데이터가 보이는 Preview·Production 권장):
 *   PLAYWRIGHT_NO_WEBSERVER=1 PLAYWRIGHT_BASE_URL=https://<host> \
 *   PLAYWRIGHT_STORAGE_STATE=tests/e2e/.auth/admin-storage.json \   # 또는 E2E_TEST_USERNAME·E2E_TEST_PASSWORD (관리자)
 *   npx playwright test tests/e2e/admin-r10-screen-check.spec.ts
 * 일부만: `R10_ONLY=/admin/users,/admin/stores`
 */
import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { adminMenu, collectAdminMenuPathEntries } from "@/components/admin/admin-menu";
import { ensureE2eUserSession, gotoWithRetry, playwrightOriginFromEnv } from "./helpers/playwright-origin-and-session";

const VIEWPORTS = [
  { name: "1024x768", width: 1024, height: 768 },
  { name: "1280x800", width: 1280, height: 800 },
] as const;

const OUT_DIR = path.resolve(process.env.R10_OUT_DIR?.trim() || ".qa-logs/admin-r10");
const ONLY = (process.env.R10_ONLY ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const LEAVES = collectAdminMenuPathEntries(adminMenu)
  .filter((e) => !e.pendingRoute)
  .filter((e) => ONLY.length === 0 || ONLY.includes(e.path));

type Clip = { kind: "page_overflow" | "main_overflow" | "clipped" | "text_cut"; selector: string; text: string; px: number };
type ScreenResult = {
  path: string;
  key: string;
  viewport: string;
  entry: "ok" | "access_denied" | "landscape_guard" | "error_boundary" | "no_main";
  clips: Clip[];
  screenshot: string;
};

function fileSafe(p: string): string {
  return p.replace(/^\//, "").replace(/[^a-zA-Z0-9_-]+/g, "_") || "admin";
}

/** 브라우저 안에서 잘림 측정 — 의도한 말줄임·가로 스크롤 컨테이너는 제외. */
async function measure(page: Page): Promise<{ entry: ScreenResult["entry"]; clips: Clip[] }> {
  return page.evaluate(() => {
    const clips: Clip[] = [];
    const main = document.querySelector<HTMLElement>("[data-admin-main-content]");
    const bodyText = document.body.innerText || "";
    if (document.querySelector("[data-admin-landscape-guard]") && !main) return { entry: "landscape_guard" as const, clips };
    if (!main) {
      if (/권한이 없|접근 권한|Access denied/i.test(bodyText)) return { entry: "access_denied" as const, clips };
      return { entry: "no_main" as const, clips };
    }
    if (/Application error|Unhandled Runtime Error|문제가 발생했습니다/.test(main.innerText || "")) {
      return { entry: "error_boundary" as const, clips };
    }

    const sel = (el: Element): string => {
      const parts: string[] = [];
      let cur: Element | null = el;
      for (let i = 0; cur && i < 4 && cur !== main; i += 1) {
        const data = [...cur.attributes].find((a) => a.name.startsWith("data-admin"));
        parts.unshift(`${cur.tagName.toLowerCase()}${data ? `[${data.name}${data.value ? `=${data.value}` : ""}]` : ""}`);
        cur = cur.parentElement;
      }
      return parts.join(" > ");
    };
    const label = (el: Element) => ((el as HTMLElement).innerText || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 60);
    const intendedEllipsis = (el: Element): boolean => {
      for (let cur: Element | null = el; cur && cur !== main; cur = cur.parentElement) {
        const cs = getComputedStyle(cur);
        if (cs.textOverflow === "ellipsis" || cs.webkitLineClamp !== "none" && cs.webkitLineClamp !== "") return true;
      }
      return false;
    };
    const inScrollX = (el: Element): boolean => {
      for (let cur: Element | null = el.parentElement; cur && cur !== main; cur = cur.parentElement) {
        const ox = getComputedStyle(cur).overflowX;
        if (ox === "auto" || ox === "scroll") return true;
      }
      return false;
    };
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none";
    };

    const doc = document.documentElement;
    if (doc.scrollWidth > doc.clientWidth + 1) {
      clips.push({ kind: "page_overflow", selector: "html", text: "", px: doc.scrollWidth - doc.clientWidth });
    }
    if (main.scrollWidth > main.clientWidth + 1) {
      clips.push({ kind: "main_overflow", selector: "main", text: "", px: main.scrollWidth - main.clientWidth });
    }

    const mainRect = main.getBoundingClientRect();
    const nodes = main.querySelectorAll("button, a, label, th, td, h1, h2, h3, p, span, [role=tab], input, select");
    for (const el of nodes) {
      if (!visible(el) || inScrollX(el) || intendedEllipsis(el)) continue;
      const he = el as HTMLElement;
      // 1) 자기 내용이 자기 상자 밖으로 (말줄임 없이) — 버튼·셀·제목
      if (he.scrollWidth > he.clientWidth + 1 && getComputedStyle(he).overflowX !== "visible" && label(el)) {
        clips.push({ kind: "text_cut", selector: sel(el), text: label(el), px: he.scrollWidth - he.clientWidth });
        continue;
      }
      // 2) 본문 오른쪽 경계 밖 (본문은 overflow-x hidden — 보이지 않게 잘림). 넘친 내용 끝까지 본다.
      const r = el.getBoundingClientRect();
      const contentRight = Math.max(r.right, r.left + he.scrollWidth);
      if (contentRight > mainRect.right + 1 && label(el)) {
        clips.push({ kind: "clipped", selector: sel(el), text: label(el), px: Math.round(contentRight - mainRect.right) });
      }
    }
    // 중복(같은 요소 계열) 축약
    const seen = new Set<string>();
    return {
      entry: "ok" as const,
      clips: clips.filter((c) => {
        const k = `${c.kind}|${c.selector}|${c.text}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      }),
    };
  });
}

test.describe.configure({ mode: "serial" });

test.describe("관리자 R10 화면 확인 (1024×768 · 1280×800)", () => {
  test.setTimeout(Math.max(120_000, LEAVES.length * VIEWPORTS.length * 30_000));

  test("메뉴 leaf 전부 — 진입 실패 0 · 잘림 0", async ({ page }) => {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    await ensureE2eUserSession(page);
    const origin = playwrightOriginFromEnv();
    const results: ScreenResult[] = [];

    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      for (const leaf of LEAVES) {
        await gotoWithRetry(page, `${origin}${leaf.path}`);
        await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
        // 로딩 상태가 끝날 때까지 (최대 10초) — 끝나지 않아도 그 상태로 측정
        await page
          .waitForFunction(() => !document.querySelector('[data-admin-state="loading"], [aria-busy="true"]'), undefined, {
            timeout: 10_000,
          })
          .catch(() => undefined);
        const m = await measure(page);
        const shot = path.join(OUT_DIR, `${vp.name}__${fileSafe(leaf.path)}.png`);
        await page.screenshot({ path: shot, fullPage: true }).catch(() => undefined);
        results.push({ path: leaf.path, key: leaf.key, viewport: vp.name, entry: m.entry, clips: m.clips, screenshot: shot });
      }
    }

    const failed = results.filter((r) => r.entry !== "ok" || r.clips.length > 0);
    fs.writeFileSync(
      path.join(OUT_DIR, "report.json"),
      JSON.stringify(
        {
          origin,
          checkedAt: new Date().toISOString(),
          screens: results.length,
          entryFailures: results.filter((r) => r.entry !== "ok").length,
          clipScreens: results.filter((r) => r.clips.length > 0).length,
          failed,
        },
        null,
        2
      )
    );
    expect(
      failed.map((r) => `${r.viewport} ${r.path} entry=${r.entry} ${r.clips.map((c) => `${c.kind}:${c.selector}「${c.text}」+${c.px}px`).join(" | ")}`)
    ).toEqual([]);
  });
});
