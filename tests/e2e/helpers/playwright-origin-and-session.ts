import type { APIRequestContext, Page } from "@playwright/test";

/** `playwright.config.ts` 의 `use.baseURL` 과 동일한 기본값 */
export function playwrightOriginFromEnv(): string {
  return (process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/**
 * 같은 origin 에 Next 가 떠 있고 `POST /api/test-login` 이 200 + `kasama_dev_uid` Set-Cookie 를 내는지 확인한다.
 * (브라우저 컨텍스트와 별개의 `APIRequestContext` 에도 쿠키가 저장되어 이후 `request.get` 검증에 사용 가능)
 */
export async function assertPlaywrightOriginAndTestLogin(
  request: APIRequestContext,
  opts?: { username?: string; password?: string }
): Promise<void> {
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
  const user = opts?.username ?? process.env.E2E_TEST_USERNAME?.trim() ?? "aaaa";
  const pass = opts?.password ?? process.env.E2E_TEST_PASSWORD ?? "1234";
  const login = await request.post(`${origin}/api/test-login`, {
    headers: { "Content-Type": "application/json" },
    data: { username: user, password: pass },
  });
  const text = await login.text();
  if (login.status() === 403) {
    throw new Error(
      `[E2E] test-login 403 — test_users 표면이 꺼져 있습니다(isProductionDeploy / isTestUsersSurfaceEnabled). body=${text.slice(0, 240)}`
    );
  }
  if (!login.ok()) {
    throw new Error(`[E2E] test-login 실패 status=${login.status()} body=${text.slice(0, 500)}`);
  }
  const setCookie = login.headers()["set-cookie"] ?? login.headers()["Set-Cookie"] ?? "";
  if (!String(setCookie).includes("kasama_dev_uid=")) {
    throw new Error(`[E2E] test-login 200 이지만 Set-Cookie(kasama_dev_uid) 없음 headers=${JSON.stringify(login.headers())}`);
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
