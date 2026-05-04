# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: home-sync-phase-three-runs.spec.ts >> home-sync client phase — 3 navigations × first silent fetch
- Location: tests\e2e\home-sync-phase-three-runs.spec.ts:14:5

# Error details

```
Error: expect(received).toBeGreaterThan(expected)

Expected: > 0
Received:   0
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
  1  | /**
  2  |  * 로컬 실측: `messenger_home_sync_silent_fetch` 콘솔 페이로드(network/json/total) 3회 수집.
  3  |  * PLAYWRIGHT_NO_WEBSERVER=1 + 기동 중 dev 서버 사용.
  4  |  */
  5  | import { expect, test } from "@playwright/test";
  6  | 
  7  | type PhaseRow = {
  8  |   tier: string;
  9  |   networkMs: number;
  10 |   jsonParseMs: number;
  11 |   totalMs: number;
  12 | };
  13 | 
  14 | test("home-sync client phase — 3 navigations × first silent fetch", async ({ page, context }) => {
  15 |   await context.addInitScript(() => {
  16 |     try {
  17 |       sessionStorage.setItem("samarket:debug:runtime", "1");
  18 |     } catch {
  19 |       /* ignore */
  20 |     }
  21 |   });
  22 | 
  23 |   const rows: PhaseRow[] = [];
  24 | 
  25 |   page.on("console", async (msg) => {
  26 |     if (msg.type() !== "debug") return;
  27 |     if (!msg.text().includes("messenger_home_sync_silent_fetch")) return;
  28 |     const args = msg.args();
  29 |     if (args.length < 2) return;
  30 |     try {
  31 |       const extra = (await args[1].jsonValue()) as Record<string, unknown>;
  32 |       if (!extra || typeof extra.networkMs !== "number") return;
  33 |       rows.push({
  34 |         tier: String(extra.tier ?? ""),
  35 |         networkMs: Number(extra.networkMs),
  36 |         jsonParseMs: Number(extra.jsonParseMs),
  37 |         totalMs: Number(extra.totalMs),
  38 |       });
  39 |     } catch {
  40 |       /* ignore */
  41 |     }
  42 |   });
  43 | 
  44 |   const user = process.env.E2E_TEST_USERNAME?.trim();
  45 |   const pass = process.env.E2E_TEST_PASSWORD ?? "";
  46 |   if (user && pass) {
  47 |     await page.goto("/", { waitUntil: "domcontentloaded" });
  48 |     const ok = await page.evaluate(
  49 |       async ({ username, password }) => {
  50 |         const r = await fetch("/api/test-login", {
  51 |           method: "POST",
  52 |           headers: { "Content-Type": "application/json" },
  53 |           credentials: "include",
  54 |           body: JSON.stringify({ username, password }),
  55 |         });
  56 |         return r.ok;
  57 |       },
  58 |       { username: user, password: pass }
  59 |     );
  60 |     if (!ok) test.skip(true, "test-login failed — set E2E_TEST_USERNAME / E2E_TEST_PASSWORD");
  61 |   }
  62 | 
  63 |   const perRound: PhaseRow[] = [];
  64 | 
  65 |   for (let round = 0; round < 3; round++) {
  66 |     const countBefore = rows.length;
  67 |     await page.goto("/philife", { waitUntil: "domcontentloaded" });
  68 |     await page.waitForTimeout(400);
  69 |     await page.goto("/community-messenger", { waitUntil: "domcontentloaded" });
  70 |     const deadline = Date.now() + 25_000;
  71 |     while (Date.now() < deadline && rows.length <= countBefore) {
  72 |       await page.waitForTimeout(200);
  73 |     }
  74 |     await page.waitForTimeout(1500);
  75 |     const newEvents = rows.slice(countBefore);
  76 |     if (newEvents.length === 0) {
  77 |       perRound.push({ tier: "(none)", networkMs: -1, jsonParseMs: -1, totalMs: -1 });
  78 |     } else {
  79 |       perRound.push(newEvents[0]);
  80 |     }
  81 |   }
  82 | 
  83 |   // eslint-disable-next-line no-console
  84 |   console.log("\n--- HOME_SYNC_PHASE_ROWS ---\n", JSON.stringify(perRound, null, 2), "\n---\n");
  85 |   test.info().attach("home_sync_phase_rows", {
  86 |     body: JSON.stringify(perRound, null, 2),
  87 |     contentType: "application/json",
  88 |   });
  89 | 
> 90 |   expect(perRound.filter((r) => r.totalMs >= 0).length).toBeGreaterThan(0);
     |                                                         ^ Error: expect(received).toBeGreaterThan(expected)
  91 | });
  92 | 
```