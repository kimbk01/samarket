import { expect, test } from "@playwright/test";

type Snap = {
  appWidePhaseLastMs?: Record<string, number>;
};

function pickMs(s: Snap | null, key: string): number | null {
  const v = s?.appWidePhaseLastMs?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

async function readSnap(page: import("@playwright/test").Page): Promise<Snap | null> {
  return page.evaluate(() => {
    const w = window as unknown as { getMessengerHomeVerificationSnapshot?: () => Snap };
    return w.getMessengerHomeVerificationSnapshot?.() ?? null;
  });
}

async function testLoginViaFetch(
  page: import("@playwright/test").Page,
  baseURL: string,
  username: string,
  password: string
): Promise<void> {
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
  expect(ok).toBe(true);
}

function collect(prefix: string, snap: Snap | null) {
  return {
    route_total_ms: pickMs(snap, `${prefix}_route_total_ms`),
    fetch_network_ms: pickMs(snap, `${prefix}_fetch_network_ms`),
    json_parse_complete_ms: pickMs(snap, `${prefix}_json_parse_complete_ms`),
    first_content_render_ms: pickMs(snap, `${prefix}_first_content_render_ms`),
    full_render_ms: pickMs(snap, `${prefix}_full_render_ms`),
    first_interactive_ms: pickMs(snap, `${prefix}_first_interactive_ms`),
    to_paint_ms: pickMs(snap, `${prefix}_to_paint_ms`),
  };
}

async function measureCommunityDetail(page: import("@playwright/test").Page, baseURL: string) {
  await page.goto(`${baseURL}/philife`, { waitUntil: "domcontentloaded" });
  const postLink = page.locator('article a[href^="/philife/"]').first();
  await postLink.waitFor({ state: "visible", timeout: 30_000 });
  await postLink.click();
  await page.waitForURL(/\/philife\/[^/?#]+$/, { timeout: 30_000 });
  await page.locator("article h1").first().waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(800);
  return collect("community_detail", await readSnap(page));
}

async function measureMessengerRoom(page: import("@playwright/test").Page, baseURL: string) {
  await page.goto(`${baseURL}/community-messenger`, { waitUntil: "domcontentloaded" });
  const roomRow = page.locator('[data-messenger-chat-row="true"]').first();
  await roomRow.waitFor({ state: "visible", timeout: 60_000 });
  await roomRow.click();
  await page.waitForURL(/\/community-messenger\/rooms\//, { timeout: 30_000 });
  await page.locator("textarea").first().waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(800);
  return collect("messenger_room_entry", await readSnap(page));
}

async function measureProductDetail(page: import("@playwright/test").Page, baseURL: string) {
  await page.goto(`${baseURL}/home`, { waitUntil: "domcontentloaded" });
  const productLink = page.locator('a[href^="/post/"]').first();
  await productLink.waitFor({ state: "visible", timeout: 30_000 });
  await productLink.click();
  await page.waitForURL(/\/post\/[^/?#]+$/, { timeout: 30_000 });
  await page.locator("h2").first().waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(800);
  return collect("product_detail", await readSnap(page));
}

test.describe("detail entry perf capture", () => {
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(() => {
      try {
        sessionStorage.setItem("samarket:debug:runtime", "1");
      } catch {
        /* ignore */
      }
    });
  });

  test("community / messenger room / product detail hot capture", async ({ page, baseURL }) => {
    test.setTimeout(240_000);
    const user = process.env.E2E_TEST_USERNAME?.trim() ?? "";
    const pass = process.env.E2E_TEST_PASSWORD ?? "";
    test.skip(!user || !pass, "E2E_TEST_USERNAME / E2E_TEST_PASSWORD 필요");

    const origin = baseURL ?? "http://127.0.0.1:3000";
    await testLoginViaFetch(page, origin, user, pass);

    const result = {
      community_detail: await measureCommunityDetail(page, origin),
      messenger_room_entry: await measureMessengerRoom(page, origin),
      product_detail: await measureProductDetail(page, origin),
    };

    // eslint-disable-next-line no-console
    console.log("\n=== DETAIL_ENTRY_PERF_JSON ===\n" + JSON.stringify(result, null, 2) + "\n=== END ===\n");

    expect(result.community_detail.first_content_render_ms).not.toBeNull();
    expect(result.messenger_room_entry.first_content_render_ms).not.toBeNull();
    expect(result.product_detail.first_content_render_ms).not.toBeNull();
  });
});
