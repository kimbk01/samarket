# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: messenger-composer-snapshot-three-stable.spec.ts >> messenger composer + snapshot three stable >> three runs: new browser context each + fixed room URL (composer_wall_ms)
- Location: tests\e2e\messenger-composer-snapshot-three-stable.spec.ts:163:7

# Error details

```
Error: [E2E] http://localhost:3000 에 연결할 수 없습니다(서버 미기동·포트 불일치·방화벽). `npm run dev` 로 Next 를 띄우거나, 이미 띄운 경우 `PLAYWRIGHT_NO_WEBSERVER=1` 로 Playwright 가 자체 webServer 를 켜지 않게 하세요.
```

# Test source

```ts
  1  | import type { APIRequestContext, Page } from "@playwright/test";
  2  | 
  3  | /** `playwright.config.ts` 의 `use.baseURL` 과 동일한 기본값 */
  4  | export function playwrightOriginFromEnv(): string {
  5  |   return (process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  6  | }
  7  | 
  8  | /**
  9  |  * 같은 origin 에 Next 가 떠 있고 `POST /api/test-login` 이 200 + `kasama_dev_uid` Set-Cookie 를 내는지 확인한다.
  10 |  * (브라우저 컨텍스트와 별개의 `APIRequestContext` 에도 쿠키가 저장되어 이후 `request.get` 검증에 사용 가능)
  11 |  */
  12 | export async function assertPlaywrightOriginAndTestLogin(
  13 |   request: APIRequestContext,
  14 |   opts?: { username?: string; password?: string }
  15 | ): Promise<void> {
  16 |   const origin = playwrightOriginFromEnv();
  17 |   const health = await request.get(origin).catch(() => null);
  18 |   if (!health) {
> 19 |     throw new Error(
     |           ^ Error: [E2E] http://localhost:3000 에 연결할 수 없습니다(서버 미기동·포트 불일치·방화벽). `npm run dev` 로 Next 를 띄우거나, 이미 띄운 경우 `PLAYWRIGHT_NO_WEBSERVER=1` 로 Playwright 가 자체 webServer 를 켜지 않게 하세요.
  20 |       `[E2E] ${origin} 에 연결할 수 없습니다(서버 미기동·포트 불일치·방화벽). ` +
  21 |         "`npm run dev` 로 Next 를 띄우거나, 이미 띄운 경우 `PLAYWRIGHT_NO_WEBSERVER=1` 로 Playwright 가 자체 webServer 를 켜지 않게 하세요."
  22 |     );
  23 |   }
  24 |   if (!health.ok() && health.status() !== 302 && health.status() !== 307 && health.status() !== 304) {
  25 |     throw new Error(`[E2E] ${origin} GET 이 비정상입니다 status=${health.status()}`);
  26 |   }
  27 |   const user = opts?.username ?? process.env.E2E_TEST_USERNAME?.trim() ?? "aaaa";
  28 |   const pass = opts?.password ?? process.env.E2E_TEST_PASSWORD ?? "1234";
  29 |   const login = await request.post(`${origin}/api/test-login`, {
  30 |     headers: { "Content-Type": "application/json" },
  31 |     data: { username: user, password: pass },
  32 |   });
  33 |   const text = await login.text();
  34 |   if (login.status() === 403) {
  35 |     throw new Error(
  36 |       `[E2E] test-login 403 — test_users 표면이 꺼져 있습니다(isProductionDeploy / isTestUsersSurfaceEnabled). body=${text.slice(0, 240)}`
  37 |     );
  38 |   }
  39 |   if (!login.ok()) {
  40 |     throw new Error(`[E2E] test-login 실패 status=${login.status()} body=${text.slice(0, 500)}`);
  41 |   }
  42 |   const setCookie = login.headers()["set-cookie"] ?? login.headers()["Set-Cookie"] ?? "";
  43 |   if (!String(setCookie).includes("kasama_dev_uid=")) {
  44 |     throw new Error(`[E2E] test-login 200 이지만 Set-Cookie(kasama_dev_uid) 없음 headers=${JSON.stringify(login.headers())}`);
  45 |   }
  46 | }
  47 | 
  48 | /** dev 서버 재시작·HMR 등으로 잠깐 끊길 때 net::ERR_ABORTED 완화 */
  49 | export async function gotoWithRetry(
  50 |   page: Page,
  51 |   url: string,
  52 |   opts?: { attempts?: number; waitMs?: number }
  53 | ): Promise<void> {
  54 |   const attempts = opts?.attempts ?? 4;
  55 |   const waitMs = opts?.waitMs ?? 1200;
  56 |   let lastErr: unknown;
  57 |   for (let i = 0; i < attempts; i += 1) {
  58 |     try {
  59 |       await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 });
  60 |       return;
  61 |     } catch (e) {
  62 |       lastErr = e;
  63 |       const msg = String(e);
  64 |       const retryable =
  65 |         msg.includes("ERR_ABORTED") ||
  66 |         msg.includes("ERR_CONNECTION") ||
  67 |         msg.includes("NS_ERROR_NET") ||
  68 |         msg.includes("ECONNREFUSED") ||
  69 |         msg.includes("net::ERR");
  70 |       if (!retryable || i === attempts - 1) {
  71 |         throw e;
  72 |       }
  73 |       await page.waitForTimeout(waitMs);
  74 |     }
  75 |   }
  76 |   throw lastErr;
  77 | }
  78 | 
```