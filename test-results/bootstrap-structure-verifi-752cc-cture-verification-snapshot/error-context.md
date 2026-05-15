# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: bootstrap-structure-verification.spec.ts >> bootstrap structure verification snapshot
- Location: tests\e2e\bootstrap-structure-verification.spec.ts:369:5

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
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
  1   | /**
  2   |  * 홈·상품상세·채팅방·메시지 전송 ACK — 네트워크 + 렌더 스냅샷 수집 (실측 비교용).
  3   |  *
  4   |  * PLAYWRIGHT_NO_WEBSERVER=1 npx playwright test tests/e2e/bootstrap-structure-verification.spec.ts
  5   |  *
  6   |  * 출력: 한 줄 `BOOTSTRAP_VERIFICATION_JSON:` + JSON (stdout 파싱용)
  7   |  */
  8   | import { expect, test } from "@playwright/test";
  9   | import { classifyCommunityMessengerRoomBootstrapCmReqSrc } from "@/lib/community-messenger/messenger-room-bootstrap";
  10  | 
  11  | type Snap = {
  12  |   appWidePhaseLastMs?: Record<string, number>;
  13  | };
  14  | 
  15  | function pickMs(s: Snap | null, key: string): number | null {
  16  |   const v = s?.appWidePhaseLastMs?.[key];
  17  |   return typeof v === "number" && Number.isFinite(v) ? v : null;
  18  | }
  19  | 
  20  | async function readSnap(page: import("@playwright/test").Page): Promise<Snap | null> {
  21  |   return page.evaluate(() => {
  22  |     const w = window as unknown as { getMessengerHomeVerificationSnapshot?: () => Snap };
  23  |     return w.getMessengerHomeVerificationSnapshot?.() ?? null;
  24  |   });
  25  | }
  26  | 
  27  | async function testLoginViaFetch(
  28  |   page: import("@playwright/test").Page,
  29  |   baseURL: string,
  30  |   username: string,
  31  |   password: string
  32  | ): Promise<void> {
  33  |   await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  34  |   let ok = false;
  35  |   for (let i = 0; i < 3 && !ok; i += 1) {
  36  |     if (i > 0) await page.waitForTimeout(600);
  37  |     ok = await page.evaluate(
  38  |       async ({ origin, user, pass }) => {
  39  |         try {
  40  |           const res = await fetch(`${origin}/api/test-login`, {
  41  |             method: "POST",
  42  |             headers: { "Content-Type": "application/json" },
  43  |             credentials: "include",
  44  |             body: JSON.stringify({ username: user, password: pass }),
  45  |           });
  46  |           const data = (await res.json()) as { ok?: boolean; userId?: string; username?: string; role?: string };
  47  |           if (!data?.ok || !data.userId || !data.username) return false;
  48  |           sessionStorage.setItem("test_user_id", data.userId);
  49  |           sessionStorage.setItem("test_username", data.username);
  50  |           sessionStorage.setItem("test_role", data.role || "member");
  51  |           document.cookie = `kasama_dev_uid_pub=${encodeURIComponent(data.userId)}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;
  52  |           window.dispatchEvent(new Event("kasama-test-auth-changed"));
  53  |           return true;
  54  |         } catch {
  55  |           return false;
  56  |         }
  57  |       },
  58  |       { origin: baseURL, user: username, pass: password }
  59  |     );
  60  |   }
> 61  |   expect(ok).toBe(true);
      |              ^ Error: expect(received).toBe(expected) // Object.is equality
  62  | }
  63  | 
  64  | function pickPhaseMap(page: import("@playwright/test").Page): Promise<Record<string, number> | null> {
  65  |   return page.evaluate(() => {
  66  |     const w = window as typeof window & { __samarketAppWidePhaseLastMs?: Record<string, number> };
  67  |     return w.__samarketAppWidePhaseLastMs ?? null;
  68  |   });
  69  | }
  70  | 
  71  | function pickMsPhase(phaseMap: Record<string, number> | null, key: string): number | null {
  72  |   const v = phaseMap?.[key];
  73  |   return typeof v === "number" && Number.isFinite(v) ? v : null;
  74  | }
  75  | 
  76  | type RequestLog = { url: string; method: string; ts: number };
  77  | 
  78  | function attachRequestLog(page: import("@playwright/test").Page, out: RequestLog[]) {
  79  |   const onReq = (req: import("@playwright/test").Request) => {
  80  |     try {
  81  |       out.push({ url: req.url(), method: req.method(), ts: Date.now() });
  82  |     } catch {
  83  |       /* ignore */
  84  |     }
  85  |   };
  86  |   page.on("request", onReq);
  87  |   return () => page.off("request", onReq);
  88  | }
  89  | 
  90  | function countMatches(logs: RequestLog[], pred: (u: string) => boolean): number {
  91  |   let n = 0;
  92  |   for (const r of logs) {
  93  |     if (pred(r.url)) n += 1;
  94  |   }
  95  |   return n;
  96  | }
  97  | 
  98  | function filterBetween(logs: RequestLog[], t0: number, t1: number): RequestLog[] {
  99  |   return logs.filter((r) => r.ts >= t0 && r.ts <= t1);
  100 | }
  101 | 
  102 | function messengerRoomBootstrapCmReqSrcRaw(url: string): string | null {
  103 |   const m = url.match(/[?&]cmReqSrc=([^&]*)/);
  104 |   return m?.[1] ? decodeURIComponent(m[1]) : null;
  105 | }
  106 | 
  107 | function messengerRoomBootstrapCmReqSrcBucket(url: string): string {
  108 |   return classifyCommunityMessengerRoomBootstrapCmReqSrc(messengerRoomBootstrapCmReqSrcRaw(url));
  109 | }
  110 | 
  111 | function isRoomClientBootstrapFamilyUrl(url: string): boolean {
  112 |   const b = messengerRoomBootstrapCmReqSrcBucket(url);
  113 |   return (
  114 |     b === "room_client" ||
  115 |     b === "room_client_legacy" ||
  116 |     b === "room_client_block" ||
  117 |     b === "room_client_primed_followup"
  118 |   );
  119 | }
  120 | 
  121 | async function measureHome(page: import("@playwright/test").Page, origin: string) {
  122 |   await page.addInitScript(() => {
  123 |     try {
  124 |       sessionStorage.setItem("samarket:debug:runtime", "1");
  125 |     } catch {
  126 |       /* ignore */
  127 |     }
  128 |   });
  129 |   await page.addInitScript(() => {
  130 |     const w = window as typeof window & {
  131 |       __tradeListRenderProbeInstalled?: boolean;
  132 |       __tradeListRenderProbe?: {
  133 |         firstItemRenderMs: number | null;
  134 |         fullRenderMs: number | null;
  135 |         toPaintMs: number | null;
  136 |       };
  137 |     };
  138 |     if (w.__tradeListRenderProbeInstalled) return;
  139 |     w.__tradeListRenderProbeInstalled = true;
  140 |     w.__tradeListRenderProbe = {
  141 |       firstItemRenderMs: null,
  142 |       fullRenderMs: null,
  143 |       toPaintMs: null,
  144 |     };
  145 |     const selector = 'a[href^="/post/"]';
  146 |     let settleTimer: ReturnType<typeof setTimeout> | null = null;
  147 |     let observer: MutationObserver | null = null;
  148 |     const finish = () => {
  149 |       const probe = w.__tradeListRenderProbe;
  150 |       if (!probe || probe.fullRenderMs != null) return;
  151 |       const links = document.querySelectorAll(selector);
  152 |       if (links.length <= 0 || probe.firstItemRenderMs == null) return;
  153 |       probe.fullRenderMs = Math.round(performance.now());
  154 |       const done = () => {
  155 |         if (!w.__tradeListRenderProbe || w.__tradeListRenderProbe.toPaintMs != null) return;
  156 |         w.__tradeListRenderProbe.toPaintMs = Math.round(performance.now());
  157 |       };
  158 |       if (typeof requestAnimationFrame !== "function") {
  159 |         queueMicrotask(done);
  160 |       } else {
  161 |         requestAnimationFrame(() => {
```