# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: messenger-home-verification.spec.ts >> messenger home verification counts >> bootstrap / refresh / subscribe — 숫자 스냅샷
- Location: tests\e2e\messenger-home-verification.spec.ts:36:7

# Error details

```
Test timeout of 120000ms exceeded.
```

```
Error: page.waitForTimeout: Test timeout of 120000ms exceeded.
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
  3   | type Snap = {
  4   |   bootstrapClientNetworkFetch: { lite: number; full: number; fresh: number; critical: number };
  5   |   bootstrapClientNetworkFetchTotal: number;
  6   |   homeSyncNetworkFetch: number;
  7   |   warmCallSiteInvocations: number;
  8   |   refreshInvocationTotal: number;
  9   |   refreshInvocationSilent: number;
  10  |   refreshInvocationNonSilent: number;
  11  |   homeRealtimeReactListenerDepth: number;
  12  |   homeRealtimeSupabaseChannelDepth: number;
  13  |   homeRealtimeMapEntries: number;
  14  |   homeRealtimeMapListenerRefs: number;
  15  |   messengerHomeDebugEvents: Record<string, number | undefined>;
  16  | };
  17  | 
  18  | async function readSnapshot(page: import("@playwright/test").Page): Promise<Snap | null> {
  19  |   return page.evaluate(() => {
  20  |     const w = window as unknown as { getMessengerHomeVerificationSnapshot?: () => Snap };
  21  |     return w.getMessengerHomeVerificationSnapshot ? w.getMessengerHomeVerificationSnapshot() : null;
  22  |   });
  23  | }
  24  | 
  25  | test.describe("messenger home verification counts", () => {
  26  |   test.beforeEach(async ({ context }) => {
  27  |     await context.addInitScript(() => {
  28  |       try {
  29  |         sessionStorage.setItem("samarket:debug:runtime", "1");
  30  |       } catch {
  31  |         /* ignore */
  32  |       }
  33  |     });
  34  |   });
  35  | 
  36  |   test("bootstrap / refresh / subscribe — 숫자 스냅샷", async ({ page }) => {
  37  |     const user = process.env.E2E_TEST_USERNAME?.trim();
  38  |     const pass = process.env.E2E_TEST_PASSWORD ?? "";
  39  |     if (user && pass) {
  40  |       await page.goto("/", { waitUntil: "domcontentloaded" });
  41  |       const ok = await page.evaluate(
  42  |         async ({ username, password }) => {
  43  |           const r = await fetch("/api/test-login", {
  44  |             method: "POST",
  45  |             headers: { "Content-Type": "application/json" },
  46  |             credentials: "include",
  47  |             body: JSON.stringify({ username, password }),
  48  |           });
  49  |           return r.ok;
  50  |         },
  51  |         { username: user, password: pass }
  52  |       );
  53  |       if (!ok) test.skip(true, "test-login returned non-OK (surface disabled or bad credentials)");
  54  |     }
  55  | 
  56  |     let bootstrapHttp = 0;
  57  |     let homeSyncHttp = 0;
  58  |     page.on("request", (req) => {
  59  |       const u = req.url();
  60  |       if (u.includes("/api/community-messenger/bootstrap")) bootstrapHttp += 1;
  61  |       if (u.includes("/api/community-messenger/home-sync")) homeSyncHttp += 1;
  62  |     });
  63  | 
  64  |     const snap = async (label: string) => {
  65  |       const s = await readSnapshot(page);
  66  |       // eslint-disable-next-line no-console
  67  |       console.log(`[${label}]`, JSON.stringify(s));
  68  |       return s;
  69  |     };
  70  | 
  71  |     await page.goto("/philife", { waitUntil: "domcontentloaded" });
  72  |     await snap("after_home_first");
  73  | 
  74  |     const bootWait = page.waitForResponse(
  75  |       (r) => r.url().includes("/api/community-messenger/bootstrap") && r.request().method() === "GET",
  76  |       { timeout: 45_000 }
  77  |     );
  78  |     await page.goto("/community-messenger", { waitUntil: "domcontentloaded" });
  79  |     await bootWait.catch(() => undefined);
  80  |     await page.waitForTimeout(2000);
  81  |     const afterFirstMessenger = await snap("after_messenger_first_entry");
  82  |     expect(afterFirstMessenger).not.toBeNull();
  83  | 
  84  |     await page.goto("/philife", { waitUntil: "domcontentloaded" });
  85  |     await page.waitForTimeout(500);
  86  |     const bootWait2 = page.waitForResponse(
  87  |       (r) => r.url().includes("/api/community-messenger/bootstrap") && r.request().method() === "GET",
  88  |       { timeout: 45_000 }
  89  |     );
  90  |     await page.goto("/community-messenger", { waitUntil: "domcontentloaded" });
  91  |     await bootWait2.catch(() => undefined);
> 92  |     await page.waitForTimeout(2000);
      |                ^ Error: page.waitForTimeout: Test timeout of 120000ms exceeded.
  93  |     const afterSecondMessenger = await snap("after_messenger_second_entry");
  94  | 
  95  |     const refreshBeforeVis = afterSecondMessenger?.refreshInvocationTotal ?? -1;
  96  |     await page.evaluate(() => {
  97  |       try {
  98  |         Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
  99  |         document.dispatchEvent(new Event("visibilitychange"));
  100 |       } catch {
  101 |         /* ignore */
  102 |       }
  103 |     });
  104 |     await page.waitForTimeout(200);
  105 |     await page.evaluate(() => {
  106 |       try {
  107 |         Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  108 |         document.dispatchEvent(new Event("visibilitychange"));
  109 |       } catch {
  110 |         /* ignore */
  111 |       }
  112 |     });
  113 |     await page.waitForTimeout(1500);
  114 |     const afterVisibility = await snap("after_visibility_toggle");
  115 | 
  116 |     const b0 = afterFirstMessenger!.bootstrapClientNetworkFetchTotal;
  117 |     const b1 = afterSecondMessenger!.bootstrapClientNetworkFetchTotal;
  118 |     const lite0 = afterFirstMessenger!.bootstrapClientNetworkFetch.lite;
  119 |     const lite1 = afterSecondMessenger!.bootstrapClientNetworkFetch.lite;
  120 | 
  121 |     const r0 = afterFirstMessenger!.refreshInvocationTotal;
  122 |     const r1 = afterSecondMessenger!.refreshInvocationTotal;
  123 |     const rVisDelta = (afterVisibility?.refreshInvocationTotal ?? 0) - refreshBeforeVis;
  124 | 
  125 |     const ev = (s: Snap) => s.messengerHomeDebugEvents;
  126 |     const subCreate0 = Number(ev(afterFirstMessenger!).messenger_home_subscribe_create ?? 0);
  127 |     const subClean0 = Number(ev(afterFirstMessenger!).messenger_home_subscribe_cleanup ?? 0);
  128 |     const subCreate1 = Number(ev(afterSecondMessenger!).messenger_home_subscribe_create ?? 0);
  129 |     const subClean1 = Number(ev(afterSecondMessenger!).messenger_home_subscribe_cleanup ?? 0);
  130 | 
  131 |     const ch0 = afterFirstMessenger!.homeRealtimeSupabaseChannelDepth;
  132 |     const ch1 = afterSecondMessenger!.homeRealtimeSupabaseChannelDepth;
  133 |     const rl0 = afterFirstMessenger!.homeRealtimeReactListenerDepth;
  134 |     const rl1 = afterSecondMessenger!.homeRealtimeReactListenerDepth;
  135 | 
  136 |     const visResume = Number(afterVisibility?.messengerHomeDebugEvents.messenger_home_visibility_resume ?? 0);
  137 | 
  138 |     // eslint-disable-next-line no-console
  139 |     console.log("\n=== MESSENGER_HOME_VERIFICATION_SUMMARY (numbers) ===");
  140 |     // eslint-disable-next-line no-console
  141 |     console.log(
  142 |       `bootstrap_network_total: first_entry=${b0} → after_tab_return=${b1} (lite: ${lite0}→${lite1})`
  143 |     );
  144 |     // eslint-disable-next-line no-console
  145 |     console.log(`bootstrap_http_requests(url_count): ${bootstrapHttp}`);
  146 |     // eslint-disable-next-line no-console
  147 |     console.log(`home_sync_http_requests(url_count): ${homeSyncHttp}`);
  148 |     // eslint-disable-next-line no-console
  149 |     console.log(`refresh_invocations_total: first_entry=${r0} → after_tab_return=${r1}`);
  150 |     // eslint-disable-next-line no-console
  151 |     console.log(`refresh_delta_on_visibility_cycle: ${rVisDelta}`);
  152 |     // eslint-disable-next-line no-console
  153 |     console.log(`visibility_resume_events_cumulative: ${visResume}`);
  154 |     // eslint-disable-next-line no-console
  155 |     console.log(
  156 |       `subscribe_debug_events: create ${subCreate0}→${subCreate1}, cleanup ${subClean0}→${subClean1}`
  157 |     );
  158 |     // eslint-disable-next-line no-console
  159 |     console.log(
  160 |       `realtime_gauges: reactListeners ${rl0}→${rl1}, supabaseChannelHandles ${ch0}→${ch1}, mapEntries ${afterFirstMessenger!.homeRealtimeMapEntries}→${afterSecondMessenger!.homeRealtimeMapEntries}`
  161 |     );
  162 |     // eslint-disable-next-line no-console
  163 |     console.log(
  164 |       `warm_call_sites: ${afterFirstMessenger!.warmCallSiteInvocations}→${afterSecondMessenger!.warmCallSiteInvocations}`
  165 |     );
  166 |     // eslint-disable-next-line no-console
  167 |     console.log("=== END ===\n");
  168 | 
  169 |     expect(afterSecondMessenger!.homeRealtimeReactListenerDepth).toBeLessThanOrEqual(2);
  170 |     expect(afterSecondMessenger!.homeRealtimeSupabaseChannelDepth).toBeLessThanOrEqual(200);
  171 |   });
  172 | });
  173 | 
```