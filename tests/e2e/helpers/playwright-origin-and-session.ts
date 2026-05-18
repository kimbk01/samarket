import fs from "node:fs";
import path from "node:path";
import { expect, type APIRequestContext, type Cookie, type Page } from "@playwright/test";

/** `playwright.config.ts` 의 `use.baseURL` 과 동일한 기본값 */
export function playwrightOriginFromEnv(): string {
  return (process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/** Next dev 서버가 응답하는지 확인 */
export async function assertPlaywrightOriginReachable(request: APIRequestContext): Promise<void> {
  const origin = playwrightOriginFromEnv();
  const health = await request.get(origin).catch(() => null);
  if (!health) {
    throw new Error(
      `[E2E] ${origin} 에 연결할 수 없습니다(서버 미기동·포트 불일치·방화벽). ` +
        "`npm run dev` 로 Next 를 띄우거나, 이미 띄운 경우 `PLAYWRIGHT_NO_WEBSERVER=1` 로 Playwright 가 자체 webServer 를 켜지 않게 하세요."
    );
  }
  if (!health.ok() && health.status() !== 302 && health.status() !== 307 && health.status() !== 304) {
    throw new Error(`[E2E] ${origin} GET 이 비정상입니다 status=${health.status()}`);
  }
}

/** `create-cm-storage-state.mjs` 출력 또는 `PLAYWRIGHT_STORAGE_STATE` */
export function resolveE2eStorageStatePath(): string | null {
  const fromEnv = process.env.PLAYWRIGHT_STORAGE_STATE?.trim();
  const candidate =
    fromEnv && fromEnv.length > 0
      ? path.resolve(fromEnv)
      : path.join(process.cwd(), "tests", "e2e", ".auth", "cm-storage.json");
  return fs.existsSync(candidate) ? candidate : null;
}

async function applyE2eStorageStateCookies(page: Page): Promise<boolean> {
  const file = resolveE2eStorageStatePath();
  if (!file) return false;
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as { cookies?: Cookie[] };
  if (!raw.cookies?.length) return false;
  await page.context().addCookies(raw.cookies);
  return true;
}

function e2eLoginCandidates(opts?: { username?: string; password?: string }): Array<{ id: string; pass: string }> {
  const envUser = opts?.username ?? process.env.E2E_TEST_USERNAME?.trim();
  const envPass = opts?.password ?? process.env.E2E_TEST_PASSWORD ?? "1234";
  if (envUser) {
    const id = envUser.includes("@") ? envUser : envUser;
    return [{ id, pass: envPass }];
  }
  return [
    { id: "aaaa", pass: "1234" },
    { id: "aaaa@samarket.local", pass: "1234" },
  ];
}

/** `/login` 비밀번호 폼으로 세션 확보 (`/api/test-login` 은 410 — UI 로그인만 사용) */
export async function ensureE2eUserSession(
  page: Page,
  opts?: { username?: string; password?: string }
): Promise<void> {
  const origin = playwrightOriginFromEnv();
  await assertPlaywrightOriginReachable(page.request);

  await applyE2eStorageStateCookies(page);

  const settingsProbe = await page.request.get(`${origin}/api/me/settings`).catch(() => null);
  if (settingsProbe?.ok()) return;

  for (const candidate of e2eLoginCandidates(opts)) {
    await gotoWithRetry(page, `${origin}/login`);
    const pwForm = page.locator("form").filter({
      has: page.getByRole("button", { name: "로그인", exact: true }),
    });
    const idInput = pwForm.locator('input[type="text"]').first();
    const passInput = pwForm.locator('input[type="password"]').first();
    await expect(idInput).toBeVisible({ timeout: 30_000 });
    await idInput.click();
    await idInput.fill("");
    await idInput.pressSequentially(candidate.id, { delay: 12 });
    await passInput.click();
    await passInput.fill("");
    await passInput.pressSequentially(candidate.pass, { delay: 12 });
    const idVal = (await idInput.inputValue().catch(() => "")).trim();
    const pwLen = (await passInput.inputValue().catch(() => "")).length;
    if (!idVal || !pwLen) {
      await idInput.fill(candidate.id);
      await passInput.fill(candidate.pass);
    }
    await pwForm.getByRole("button", { name: "로그인", exact: true }).click();
    try {
      await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 45_000 });
    } catch {
      /* try next candidate */
    }
    if (!page.url().includes("/login")) {
      const after = await page.request.get(`${origin}/api/me/settings`);
      if (after.ok()) return;
    }
  }

  const alertText = await page.locator('[role="alert"]').first().textContent().catch(() => "");
  throw new Error(
    "[E2E] UI 로그인 실패 — E2E_TEST_USERNAME·E2E_TEST_PASSWORD, " +
      "node tests/e2e/scripts/create-cm-storage-state.mjs 로 tests/e2e/.auth/cm-storage.json 생성, " +
      `또는 PLAYWRIGHT_STORAGE_STATE 를 설정하세요. alert=${String(alertText).slice(0, 200)} url=${page.url()}`
  );
}

/**
 * origin 헬스체크 + (page 가 있으면) UI 로그인 세션 확보.
 * `POST /api/test-login` 은 비활성(410)이므로 page 없이 호출하면 헬스만 검사한다.
 */
export async function assertPlaywrightOriginAndTestLogin(
  request: APIRequestContext,
  page?: Page,
  opts?: { username?: string; password?: string }
): Promise<void> {
  await assertPlaywrightOriginReachable(request);
  if (page) {
    await ensureE2eUserSession(page, opts);
  }
}

/** dev 서버 재시작·HMR 등으로 잠깐 끊길 때 net::ERR_ABORTED 완화 */
export async function gotoWithRetry(
  page: Page,
  url: string,
  opts?: { attempts?: number; waitMs?: number }
): Promise<void> {
  const attempts = opts?.attempts ?? 4;
  const waitMs = opts?.waitMs ?? 1200;
  let lastErr: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 });
      return;
    } catch (e) {
      lastErr = e;
      const msg = String(e);
      const retryable =
        msg.includes("ERR_ABORTED") ||
        msg.includes("ERR_CONNECTION") ||
        msg.includes("NS_ERROR_NET") ||
        msg.includes("ECONNREFUSED") ||
        msg.includes("net::ERR");
      if (!retryable || i === attempts - 1) {
        throw e;
      }
      await page.waitForTimeout(waitMs);
    }
  }
  throw lastErr;
}
