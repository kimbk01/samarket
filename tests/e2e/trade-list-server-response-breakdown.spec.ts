import { expect, test } from "@playwright/test";

type BreakdownMetrics = {
  resolve_home_posts_start_ms: number | null;
  db_query_start_ms: number | null;
  db_query_end_ms: number | null;
  related_fetch_start_ms: number | null;
  related_fetch_end_ms: number | null;
  transform_start_ms: number | null;
  transform_end_ms: number | null;
  serialize_start_ms: number | null;
  serialize_end_ms: number | null;
  response_start_ms: number | null;
  response_end_ms: number | null;
  db_query_ms: number | null;
  related_fetch_ms: number | null;
  transform_ms: number | null;
  serialize_ms: number | null;
  response_ms: number | null;
};

async function testLoginViaFetch(
  page: import("@playwright/test").Page,
  baseURL: string,
  username: string,
  password: string
): Promise<boolean> {
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  let ok = false;
  for (let i = 0; i < 3 && !ok; i += 1) {
    if (i > 0) await page.waitForTimeout(600);
    ok = await page.evaluate(
      async ({ origin, user, pass }) => {
        try {
          const res = await fetch(`${origin}/api/test-login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ username: user, password: pass }),
          });
          const data = (await res.json()) as { ok?: boolean; userId?: string; username?: string; role?: string };
          if (!data?.ok || !data.userId || !data.username) return false;
          sessionStorage.setItem("test_user_id", data.userId);
          sessionStorage.setItem("test_username", data.username);
          sessionStorage.setItem("test_role", data.role || "member");
          document.cookie = `kasama_dev_uid_pub=${encodeURIComponent(data.userId)}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;
          window.dispatchEvent(new Event("kasama-test-auth-changed"));
          return true;
        } catch {
          return false;
        }
      },
      { origin: baseURL, user: username, pass: password }
    );
  }
  return ok;
}

async function testLoginViaUi(
  page: import("@playwright/test").Page,
  baseURL: string,
  username: string,
  password: string
): Promise<void> {
  await page.goto(`${baseURL}/login`, { waitUntil: "domcontentloaded" });
  const userInput = page.locator('input[type="text"], input[type="email"]').first();
  const passInput = page.locator('input[type="password"]').first();
  await userInput.waitFor({ state: "visible", timeout: 60_000 });
  await passInput.waitFor({ state: "visible", timeout: 60_000 });
  await userInput.fill(username);
  await passInput.fill(password);
  const loginButton = page.getByRole("button", { name: "로그인", exact: true });
  await Promise.all([
    page.waitForURL((u) => u.pathname === "/home" || u.pathname.startsWith("/mypage"), { timeout: 60_000 }),
    loginButton.click(),
  ]);
}

async function ensureLoggedIn(
  page: import("@playwright/test").Page,
  baseURL: string,
  username: string,
  password: string
): Promise<void> {
  const ok = await testLoginViaFetch(page, baseURL, username, password);
  if (ok) return;
  await testLoginViaUi(page, baseURL, username, password);
}

test.describe("trade list server response breakdown", () => {
  test("capture deployed server response breakdown", async ({ browser }) => {
    test.setTimeout(300_000);
    const origin = "https://samarket.vercel.app";
    const page = await browser.newPage();
    await ensureLoggedIn(page, origin, "aaaa", "1234");
    const result = await page.evaluate(async () => {
      const toNum = (v: string | null): number | null => {
        if (!v) return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
      };
      const res = await fetch("/api/home/posts?page=1&sort=latest&home_diag=1", {
        credentials: "include",
        cache: "no-store",
      });
      const text = await res.text();
      const data = JSON.parse(text) as { posts?: Array<{ images?: string[] | null; thumbnail_url?: string | null }> };
      const posts = Array.isArray(data.posts) ? data.posts : [];
      const imageCount = posts.reduce((sum, post) => {
        const images = Array.isArray(post.images) ? post.images.length : 0;
        if (images > 0) return sum + images;
        return post.thumbnail_url ? sum + 1 : sum;
      }, 0);
      const resolveHomePostsStartMs = toNum(res.headers.get("x-samarket-resolve-home-posts-start-ms"));
      const dbQueryStartMs = toNum(res.headers.get("x-samarket-db-query-start-ms"));
      const dbQueryEndMs = toNum(res.headers.get("x-samarket-db-query-end-ms"));
      const relatedFetchStartMs = toNum(res.headers.get("x-samarket-related-fetch-start-ms"));
      const relatedFetchEndMs = toNum(res.headers.get("x-samarket-related-fetch-end-ms"));
      const transformStartMs = toNum(res.headers.get("x-samarket-transform-start-ms"));
      const transformEndMs = toNum(res.headers.get("x-samarket-transform-end-ms"));
      const serializeStartMs = toNum(res.headers.get("x-samarket-serialize-start-ms"));
      const serializeEndMs = toNum(res.headers.get("x-samarket-serialize-end-ms"));
      const responseStartMs = toNum(res.headers.get("x-samarket-response-start-ms"));
      const responseEndMs = toNum(res.headers.get("x-samarket-response-end-ms"));
      const diff = (start: number | null, end: number | null) =>
        start != null && end != null ? Math.max(0, end - start) : null;
      return {
        resolve_home_posts_start_ms: resolveHomePostsStartMs,
        db_query_start_ms: dbQueryStartMs,
        db_query_end_ms: dbQueryEndMs,
        related_fetch_start_ms: relatedFetchStartMs,
        related_fetch_end_ms: relatedFetchEndMs,
        transform_start_ms: transformStartMs,
        transform_end_ms: transformEndMs,
        serialize_start_ms: serializeStartMs,
        serialize_end_ms: serializeEndMs,
        response_start_ms: responseStartMs,
        response_end_ms: responseEndMs,
        db_query_ms: diff(dbQueryStartMs, dbQueryEndMs),
        related_fetch_ms: diff(relatedFetchStartMs, relatedFetchEndMs),
        transform_ms: diff(transformStartMs, transformEndMs),
        serialize_ms: diff(serializeStartMs, serializeEndMs),
        response_ms: diff(responseStartMs, responseEndMs),
        response_size_bytes: new TextEncoder().encode(text).length,
        item_count: posts.length,
        image_count: imageCount,
      };
    });
    await page.close();

    // eslint-disable-next-line no-console
    console.log(
      "\n=== TRADE_LIST_SERVER_RESPONSE_BREAKDOWN_JSON ===\n" +
        JSON.stringify(result, null, 2) +
        "\n=== END ===\n"
    );

    expect(result.db_query_end_ms).not.toBeNull();
  });
});
