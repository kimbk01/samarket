import { expect, test } from "@playwright/test";

type TradeApiMetrics = {
  trade_list_route_total_ms: number | null;
  trade_list_fetch_network_ms: number | null;
  trade_list_response_size_bytes: number | null;
  trade_list_json_parse_complete_ms: number | null;
  trade_list_db_fetch_ms: number | null;
  trade_list_item_count: number | null;
  trade_list_image_count: number | null;
};

type TradeRenderMetrics = {
  trade_list_first_item_render_ms: number | null;
  trade_list_full_render_ms: number | null;
  trade_list_to_paint_ms: number | null;
  trade_list_route_enter_ms: number | null;
  trade_list_page_mount_start_ms: number | null;
  trade_list_page_mount_end_ms: number | null;
  trade_list_home_content_render_start_ms: number | null;
  trade_list_home_content_render_end_ms: number | null;
  trade_list_product_list_render_start_ms: number | null;
  trade_list_product_list_render_end_ms: number | null;
  trade_list_first_card_render_start_ms: number | null;
  trade_list_first_card_render_end_ms: number | null;
  trade_list_first_card_image_request_start_ms: number | null;
  trade_list_first_card_image_request_end_ms: number | null;
  trade_list_hydration_complete_ms: number | null;
  trade_list_product_card_render_count: number | null;
  trade_list_initial_visible_card_count: number | null;
  trade_list_first_render_map_item_count: number | null;
  trade_list_first_render_image_component_count: number | null;
};

function pickMs(phaseMap: Record<string, number> | null, key: string): number | null {
  const v = phaseMap?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

async function readPhaseMap(page: import("@playwright/test").Page): Promise<Record<string, number> | null> {
  return page.evaluate(() => {
    const w = window as unknown as { __samarketAppWidePhaseLastMs?: Record<string, number> };
    return w.__samarketAppWidePhaseLastMs ?? null;
  });
}

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

async function measureTradeApi(page: import("@playwright/test").Page, origin: string): Promise<TradeApiMetrics> {
  return page.evaluate(async () => {
    const t0 = performance.now();
    const res = await fetch("/api/home/posts?page=1&sort=latest", {
      credentials: "include",
      cache: "no-store",
    });
    const tResponse = performance.now();
    const text = await res.text();
    const tText = performance.now();
    const data = JSON.parse(text) as { posts?: Array<{ images?: string[] | null; thumbnail_url?: string | null }> };
    const tParse = performance.now();
    const posts = Array.isArray(data.posts) ? data.posts : [];
    const imageCount = posts.reduce((sum, post) => {
      const images = Array.isArray(post.images) ? post.images.length : 0;
      if (images > 0) return sum + images;
      return post.thumbnail_url ? sum + 1 : sum;
    }, 0);
    return {
      trade_list_route_total_ms: Math.round(tText - t0),
      trade_list_fetch_network_ms: Math.round(tResponse - t0),
      trade_list_response_size_bytes: new TextEncoder().encode(text).length,
      trade_list_json_parse_complete_ms: Math.round(tParse - t0),
      trade_list_db_fetch_ms: null,
      trade_list_item_count: posts.length,
      trade_list_image_count: imageCount,
    };
  });
}

async function measureTradeRender(page: import("@playwright/test").Page, origin: string): Promise<TradeRenderMetrics> {
  await page.addInitScript(() => {
    const w = window as typeof window & {
      __tradeListRenderProbeInstalled?: boolean;
      __tradeListRenderProbe?: {
        firstItemRenderMs: number | null;
        fullRenderMs: number | null;
        toPaintMs: number | null;
      };
    };
    if (w.__tradeListRenderProbeInstalled) return;
    w.__tradeListRenderProbeInstalled = true;
    w.__tradeListRenderProbe = {
      firstItemRenderMs: null,
      fullRenderMs: null,
      toPaintMs: null,
    };
    const selector = 'a[href^="/post/"]';
    let settleTimer: ReturnType<typeof setTimeout> | null = null;
    let observer: MutationObserver | null = null;
    const finish = () => {
      const probe = w.__tradeListRenderProbe;
      if (!probe || probe.fullRenderMs != null) return;
      const links = document.querySelectorAll(selector);
      if (links.length <= 0 || probe.firstItemRenderMs == null) return;
      probe.fullRenderMs = Math.round(performance.now());
      const done = () => {
        if (!w.__tradeListRenderProbe || w.__tradeListRenderProbe.toPaintMs != null) return;
        w.__tradeListRenderProbe.toPaintMs = Math.round(performance.now());
      };
      if (typeof requestAnimationFrame !== "function") {
        queueMicrotask(done);
      } else {
        requestAnimationFrame(() => {
          requestAnimationFrame(done);
        });
      }
      if (observer) observer.disconnect();
    };
    const scheduleFinish = () => {
      if (settleTimer != null) clearTimeout(settleTimer);
      settleTimer = setTimeout(finish, 350);
    };
    const sample = () => {
      const probe = w.__tradeListRenderProbe;
      if (!probe) return;
      const links = document.querySelectorAll(selector);
      if (links.length > 0 && probe.firstItemRenderMs == null) {
        probe.firstItemRenderMs = Math.round(performance.now());
      }
      if (links.length > 0) {
        scheduleFinish();
      }
    };
    const start = () => {
      observer = new MutationObserver(sample);
      observer.observe(document.documentElement, { childList: true, subtree: true });
      sample();
      setTimeout(() => {
        if (observer) observer.disconnect();
        finish();
      }, 15_000);
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
      start();
    }
  });
  await page.goto(`${origin}/home`, { waitUntil: "domcontentloaded" });
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const w = window as typeof window & {
            __tradeListRenderProbe?: {
              firstItemRenderMs: number | null;
              fullRenderMs: number | null;
              toPaintMs: number | null;
            };
          };
          return w.__tradeListRenderProbe?.toPaintMs ?? null;
        }),
      { timeout: 20_000 }
    )
    .not.toBeNull();
  const manual = await page.evaluate(() => {
    const w = window as typeof window & {
      __tradeListRenderProbe?: {
        firstItemRenderMs: number | null;
        fullRenderMs: number | null;
        toPaintMs: number | null;
      };
    };
    const probe = w.__tradeListRenderProbe;
    return {
      trade_list_first_item_render_ms: probe?.firstItemRenderMs ?? null,
      trade_list_full_render_ms: probe?.fullRenderMs ?? null,
      trade_list_to_paint_ms: probe?.toPaintMs ?? null,
      trade_list_route_enter_ms: null,
      trade_list_page_mount_start_ms: null,
      trade_list_page_mount_end_ms: null,
      trade_list_home_content_render_start_ms: null,
      trade_list_home_content_render_end_ms: null,
      trade_list_product_list_render_start_ms: null,
      trade_list_product_list_render_end_ms: null,
      trade_list_first_card_render_start_ms: null,
      trade_list_first_card_render_end_ms: null,
      trade_list_first_card_image_request_start_ms: null,
      trade_list_first_card_image_request_end_ms: null,
      trade_list_hydration_complete_ms: null,
      trade_list_product_card_render_count: null,
      trade_list_initial_visible_card_count: null,
      trade_list_first_render_map_item_count: null,
      trade_list_first_render_image_component_count: null,
    } as TradeRenderMetrics;
  });
  await page.waitForTimeout(500);
  const snap = await readPhaseMap(page);
  return {
    ...manual,
    trade_list_route_enter_ms: pickMs(snap, "trade_list_route_enter_ms"),
    trade_list_page_mount_start_ms: pickMs(snap, "trade_list_page_mount_start_ms"),
    trade_list_page_mount_end_ms: pickMs(snap, "trade_list_page_mount_end_ms"),
    trade_list_home_content_render_start_ms: pickMs(snap, "trade_list_home_content_render_start_ms"),
    trade_list_home_content_render_end_ms: pickMs(snap, "trade_list_home_content_render_end_ms"),
    trade_list_product_list_render_start_ms: pickMs(snap, "trade_list_product_list_render_start_ms"),
    trade_list_product_list_render_end_ms: pickMs(snap, "trade_list_product_list_render_end_ms"),
    trade_list_first_card_render_start_ms: pickMs(snap, "trade_list_first_card_render_start_ms"),
    trade_list_first_card_render_end_ms: pickMs(snap, "trade_list_first_card_render_end_ms"),
    trade_list_first_card_image_request_start_ms: pickMs(snap, "trade_list_first_card_image_request_start_ms"),
    trade_list_first_card_image_request_end_ms: pickMs(snap, "trade_list_first_card_image_request_end_ms"),
    trade_list_hydration_complete_ms: pickMs(snap, "trade_list_hydration_complete_ms"),
    trade_list_product_card_render_count: pickMs(snap, "trade_list_product_card_render_count"),
    trade_list_initial_visible_card_count: pickMs(snap, "trade_list_initial_visible_card_count"),
    trade_list_first_render_map_item_count: pickMs(snap, "trade_list_first_render_map_item_count"),
    trade_list_first_render_image_component_count: pickMs(snap, "trade_list_first_render_image_component_count"),
  };
}

async function measureTradeList(page: import("@playwright/test").Page, origin: string) {
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem("samarket:debug:runtime", "1");
    } catch {
      /* ignore */
    }
  });
  await ensureLoggedIn(page, origin, "aaaa", "1234");
  const render = await measureTradeRender(page, origin);
  const api = await measureTradeApi(page, origin);
  return { ...api, ...render };
}

test.describe("trade list local vs vercel", () => {
  test("capture local and vercel trade list metrics", async ({ browser, baseURL }) => {
    test.setTimeout(300_000);
    const localOrigin = baseURL ?? "http://127.0.0.1:3000";
    const remoteOrigin = "https://samarket.vercel.app";

    const localPage = await browser.newPage();
    const remotePage = await browser.newPage();
    const local = await measureTradeList(localPage, localOrigin);
    const remote = await measureTradeList(remotePage, remoteOrigin);
    await localPage.close();
    await remotePage.close();

    const delta = Object.fromEntries(
      Object.keys(local).map((key) => {
        const left = local[key as keyof typeof local];
        const right = remote[key as keyof typeof remote];
        return [key, typeof left === "number" && typeof right === "number" ? right - left : null];
      })
    );

    // eslint-disable-next-line no-console
    console.log(
      "\n=== TRADE_LIST_LOCAL_VS_VERCEL_JSON ===\n" +
        JSON.stringify(
          {
            local,
            remote,
            delta,
          },
          null,
          2
        ) +
        "\n=== END ===\n"
    );

    expect(local.trade_list_first_item_render_ms).not.toBeNull();
    expect(remote.trade_list_first_item_render_ms).not.toBeNull();
  });
});
