# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: nav-perf-idle-bottom-nav.spec.ts >> nav-perf idle bottom-nav (터미널 덤프) >> 시나리오 후 __NAV_PERF_EVENTS JSON 출력
- Location: tests\e2e\nav-perf-idle-bottom-nav.spec.ts:31:7

# Error details

```
Error: [nav-perf-e2e] 하단 네비(메신저 탭) 없음 — 현재 URL=http://localhost:3000/login?next=%2Fmarket. 비로그인이면 proxy 가 /login 으로 보냅니다. POST /api/test-login 이 200(process.env·테스트 표면)일 때만 측정 가능합니다.
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e3]:
    - heading "dibaY 로그인" [level=1] [ref=e4]
    - paragraph [ref=e5]: 관리자 설정에 따라 로그인 방식이 표시됩니다.
    - generic [ref=e7]:
      - button "Google로 계속하기" [ref=e8]
      - button "Kakao로 계속하기" [ref=e9]
    - generic [ref=e12]: 또는 아이디/비밀번호
    - generic [ref=e14]:
      - group [ref=e15]:
        - generic [ref=e16]:
          - generic [ref=e17]: 이메일 또는 로그인 ID
          - textbox "이메일 또는 로그인 ID" [ref=e18]
        - generic [ref=e19]:
          - generic [ref=e20]: 비밀번호
          - textbox [ref=e21]
      - button "로그인" [ref=e22]
  - alert [ref=e23]
```

# Test source

```ts
  1   | import { test, expect } from "@playwright/test";
  2   | 
  3   | /**
  4   |  * NAV-PERF-3: idle 후 첫 하단탭 클릭 vs 연속 클릭 — 브라우저 측정값을 터미널에 출력.
  5   |  *
  6   |  * 사전조건:
  7   |  * - `npm run dev` (localhost:3000)
  8   |  * - 메인 셸 탭은 로그인 세션 필요. `E2E_TEST_USERNAME` / `E2E_TEST_PASSWORD` 로 test-login 시도.
  9   |  * - `POST /api/test-login` 이 410 이면(임시 테스트 로그인 비활성) 하단 네비까지 진입 불가 → 이 스크립트도 실패.
  10  |  * - `beforeEach` 가 `sessionStorage samarket:debug:runtime` + **`localStorage samarket:debug:navPerf`** 를 켜 `[nav-perf]` 이벤트를 수집합니다.
  11  |  *
  12  |  * 실행: `npm run measure:nav-perf`
  13  |  */
  14  | 
  15  | type NavPerfRow = Record<string, unknown>;
  16  | 
  17  | test.describe.configure({ timeout: 240_000 });
  18  | 
  19  | test.describe("nav-perf idle bottom-nav (터미널 덤프)", () => {
  20  |   test.beforeEach(async ({ context }) => {
  21  |     await context.addInitScript(() => {
  22  |       try {
  23  |         sessionStorage.setItem("samarket:debug:runtime", "1");
  24  |         window.localStorage.setItem("samarket:debug:navPerf", "1");
  25  |       } catch {
  26  |         /* ignore */
  27  |       }
  28  |     });
  29  |   });
  30  | 
  31  |   test("시나리오 후 __NAV_PERF_EVENTS JSON 출력", async ({ page, baseURL }) => {
  32  |     test.setTimeout(240_000);
  33  | 
  34  |     const user = process.env.E2E_TEST_USERNAME?.trim();
  35  |     const pass = process.env.E2E_TEST_PASSWORD ?? "";
  36  | 
  37  |     const origin = baseURL ?? "http://localhost:3000";
  38  | 
  39  |     if (user && pass) {
  40  |       await page.goto(origin, { waitUntil: "domcontentloaded" });
  41  |       const loginResult = await page.evaluate(
  42  |         async ({ o, username, password }) => {
  43  |           const r = await fetch(`${o}/api/test-login`, {
  44  |             method: "POST",
  45  |             headers: { "Content-Type": "application/json" },
  46  |             credentials: "include",
  47  |             body: JSON.stringify({ username, password }),
  48  |           });
  49  |           const data = (await r.json()) as { ok?: boolean; userId?: string; username?: string; role?: string };
  50  |           if (!data?.ok || !data.userId || !data.username) return false;
  51  |           try {
  52  |             sessionStorage.removeItem("samarket.messenger.bootstrap.v1");
  53  |           } catch {
  54  |             /* ignore */
  55  |           }
  56  |           sessionStorage.setItem("test_user_id", data.userId);
  57  |           sessionStorage.setItem("test_username", data.username);
  58  |           sessionStorage.setItem("test_role", data.role || "member");
  59  |           try {
  60  |             document.cookie = `kasama_dev_uid_pub=${encodeURIComponent(data.userId)}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;
  61  |           } catch {
  62  |             /* ignore */
  63  |           }
  64  |           window.dispatchEvent(new Event("kasama-test-auth-changed"));
  65  |           return true;
  66  |         },
  67  |         { o: origin, username: user, password: pass }
  68  |       );
  69  |       // eslint-disable-next-line no-console
  70  |       console.log("[nav-perf-e2e] test-login", loginResult ? "ok" : "failed — 비로그인으로 진행");
  71  |     } else {
  72  |       // eslint-disable-next-line no-console
  73  |       console.log("[nav-perf-e2e] E2E 자격 증명 없음 — 비로그인으로 진행");
  74  |     }
  75  | 
  76  |     await page.goto(`${origin}/market`, { waitUntil: "domcontentloaded" });
  77  | 
  78  |     const messengerTab = page.locator('a.app-bottom-nav-item[href^="/community-messenger"]').first();
  79  |     try {
  80  |       await messengerTab.waitFor({ state: "visible", timeout: 15_000 });
  81  |     } catch {
> 82  |       throw new Error(
      |             ^ Error: [nav-perf-e2e] 하단 네비(메신저 탭) 없음 — 현재 URL=http://localhost:3000/login?next=%2Fmarket. 비로그인이면 proxy 가 /login 으로 보냅니다. POST /api/test-login 이 200(process.env·테스트 표면)일 때만 측정 가능합니다.
  83  |         `[nav-perf-e2e] 하단 네비(메신저 탭) 없음 — 현재 URL=${page.url()}. ` +
  84  |           `비로그인이면 proxy 가 /login 으로 보냅니다. ` +
  85  |           `POST /api/test-login 이 200(process.env·테스트 표면)일 때만 측정 가능합니다.`
  86  |       );
  87  |     }
  88  | 
  89  |     // 1–3: /market 에서 30초 idle
  90  |     await page.waitForTimeout(30_000);
  91  | 
  92  |     // 4: 메신저 탭
  93  |     await messengerTab.click();
  94  |     await page.waitForURL(/\/community-messenger/, { timeout: 60_000 });
  95  | 
  96  |     // 5: 스토어 탭 (바로 다음)
  97  |     await page.locator('a.app-bottom-nav-item[href="/stores"]').first().click();
  98  |     await page.waitForURL(/\/stores/, { timeout: 60_000 });
  99  | 
  100 |     // 7: 30초 idle
  101 |     await page.waitForTimeout(30_000);
  102 | 
  103 |     // 8: 마이페이지
  104 |     await page.locator('a.app-bottom-nav-item[href="/mypage"]').first().click();
  105 |     await page.waitForURL(/\/mypage/, { timeout: 60_000 });
  106 | 
  107 |     // 10: 거래(/market)
  108 |     await page.locator('a.app-bottom-nav-item[href="/market"]').first().click();
  109 |     await page.waitForURL(/\/market/, { timeout: 60_000 });
  110 | 
  111 |     // apis_sampled_1500ms 가 각 행에 붙을 시간
  112 |     await page.waitForTimeout(3500);
  113 | 
  114 |     const events = await page.evaluate(() => {
  115 |       const w = window as unknown as { __NAV_PERF_EVENTS?: NavPerfRow[] };
  116 |       return JSON.parse(JSON.stringify(w.__NAV_PERF_EVENTS ?? [])) as NavPerfRow[];
  117 |     });
  118 | 
  119 |     // eslint-disable-next-line no-console
  120 |     console.log("\n=== NAV_PERF_EVENTS (browser → terminal) ===");
  121 |     // eslint-disable-next-line no-console
  122 |     console.log(JSON.stringify(events, null, 2));
  123 |     // eslint-disable-next-line no-console
  124 |     console.log("=== COUNT ===", events.length);
  125 |     // eslint-disable-next-line no-console
  126 |     console.log("=== END ===\n");
  127 | 
  128 |     expect(events.length, "nav-perf 이벤트 없음 — dev 빌드·하단탭 소스 bottom-nav 확인").toBeGreaterThanOrEqual(1);
  129 |   });
  130 | });
  131 | 
```