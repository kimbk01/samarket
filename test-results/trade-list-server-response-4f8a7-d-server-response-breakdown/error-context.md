# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: trade-list-server-response-breakdown.spec.ts >> trade list server response breakdown >> capture deployed server response breakdown
- Location: tests\e2e\trade-list-server-response-breakdown.spec.ts:91:7

# Error details

```
Error: expect(received).not.toBeNull()

Received: null
```

# Test source

```ts
  58  | 
  59  | async function testLoginViaUi(
  60  |   page: import("@playwright/test").Page,
  61  |   baseURL: string,
  62  |   username: string,
  63  |   password: string
  64  | ): Promise<void> {
  65  |   await page.goto(`${baseURL}/login`, { waitUntil: "domcontentloaded" });
  66  |   const userInput = page.locator('input[type="text"], input[type="email"]').first();
  67  |   const passInput = page.locator('input[type="password"]').first();
  68  |   await userInput.waitFor({ state: "visible", timeout: 60_000 });
  69  |   await passInput.waitFor({ state: "visible", timeout: 60_000 });
  70  |   await userInput.fill(username);
  71  |   await passInput.fill(password);
  72  |   const loginButton = page.getByRole("button", { name: "로그인", exact: true });
  73  |   await Promise.all([
  74  |     page.waitForURL((u) => u.pathname === "/home" || u.pathname.startsWith("/mypage"), { timeout: 60_000 }),
  75  |     loginButton.click(),
  76  |   ]);
  77  | }
  78  | 
  79  | async function ensureLoggedIn(
  80  |   page: import("@playwright/test").Page,
  81  |   baseURL: string,
  82  |   username: string,
  83  |   password: string
  84  | ): Promise<void> {
  85  |   const ok = await testLoginViaFetch(page, baseURL, username, password);
  86  |   if (ok) return;
  87  |   await testLoginViaUi(page, baseURL, username, password);
  88  | }
  89  | 
  90  | test.describe("trade list server response breakdown", () => {
  91  |   test("capture deployed server response breakdown", async ({ browser }) => {
  92  |     test.setTimeout(300_000);
  93  |     const origin = "https://samarket.vercel.app";
  94  |     const page = await browser.newPage();
  95  |     await ensureLoggedIn(page, origin, "aaaa", "1234");
  96  |     const result = await page.evaluate(async () => {
  97  |       const toNum = (v: string | null): number | null => {
  98  |         if (!v) return null;
  99  |         const n = Number(v);
  100 |         return Number.isFinite(n) ? n : null;
  101 |       };
  102 |       const res = await fetch("/api/home/posts?page=1&sort=latest&home_diag=1", {
  103 |         credentials: "include",
  104 |         cache: "no-store",
  105 |       });
  106 |       const text = await res.text();
  107 |       const data = JSON.parse(text) as { posts?: Array<{ images?: string[] | null; thumbnail_url?: string | null }> };
  108 |       const posts = Array.isArray(data.posts) ? data.posts : [];
  109 |       const imageCount = posts.reduce((sum, post) => {
  110 |         const images = Array.isArray(post.images) ? post.images.length : 0;
  111 |         if (images > 0) return sum + images;
  112 |         return post.thumbnail_url ? sum + 1 : sum;
  113 |       }, 0);
  114 |       const resolveHomePostsStartMs = toNum(res.headers.get("x-samarket-resolve-home-posts-start-ms"));
  115 |       const dbQueryStartMs = toNum(res.headers.get("x-samarket-db-query-start-ms"));
  116 |       const dbQueryEndMs = toNum(res.headers.get("x-samarket-db-query-end-ms"));
  117 |       const relatedFetchStartMs = toNum(res.headers.get("x-samarket-related-fetch-start-ms"));
  118 |       const relatedFetchEndMs = toNum(res.headers.get("x-samarket-related-fetch-end-ms"));
  119 |       const transformStartMs = toNum(res.headers.get("x-samarket-transform-start-ms"));
  120 |       const transformEndMs = toNum(res.headers.get("x-samarket-transform-end-ms"));
  121 |       const serializeStartMs = toNum(res.headers.get("x-samarket-serialize-start-ms"));
  122 |       const serializeEndMs = toNum(res.headers.get("x-samarket-serialize-end-ms"));
  123 |       const responseStartMs = toNum(res.headers.get("x-samarket-response-start-ms"));
  124 |       const responseEndMs = toNum(res.headers.get("x-samarket-response-end-ms"));
  125 |       const diff = (start: number | null, end: number | null) =>
  126 |         start != null && end != null ? Math.max(0, end - start) : null;
  127 |       return {
  128 |         resolve_home_posts_start_ms: resolveHomePostsStartMs,
  129 |         db_query_start_ms: dbQueryStartMs,
  130 |         db_query_end_ms: dbQueryEndMs,
  131 |         related_fetch_start_ms: relatedFetchStartMs,
  132 |         related_fetch_end_ms: relatedFetchEndMs,
  133 |         transform_start_ms: transformStartMs,
  134 |         transform_end_ms: transformEndMs,
  135 |         serialize_start_ms: serializeStartMs,
  136 |         serialize_end_ms: serializeEndMs,
  137 |         response_start_ms: responseStartMs,
  138 |         response_end_ms: responseEndMs,
  139 |         db_query_ms: diff(dbQueryStartMs, dbQueryEndMs),
  140 |         related_fetch_ms: diff(relatedFetchStartMs, relatedFetchEndMs),
  141 |         transform_ms: diff(transformStartMs, transformEndMs),
  142 |         serialize_ms: diff(serializeStartMs, serializeEndMs),
  143 |         response_ms: diff(responseStartMs, responseEndMs),
  144 |         response_size_bytes: new TextEncoder().encode(text).length,
  145 |         item_count: posts.length,
  146 |         image_count: imageCount,
  147 |       };
  148 |     });
  149 |     await page.close();
  150 | 
  151 |     // eslint-disable-next-line no-console
  152 |     console.log(
  153 |       "\n=== TRADE_LIST_SERVER_RESPONSE_BREAKDOWN_JSON ===\n" +
  154 |         JSON.stringify(result, null, 2) +
  155 |         "\n=== END ===\n"
  156 |     );
  157 | 
> 158 |     expect(result.db_query_end_ms).not.toBeNull();
      |                                        ^ Error: expect(received).not.toBeNull()
  159 |   });
  160 | });
  161 | 
```