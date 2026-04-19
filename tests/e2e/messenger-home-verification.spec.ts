import { test, expect } from "@playwright/test";

type Snap = {
  bootstrapClientNetworkFetch: { lite: number; full: number; fresh: number };
  bootstrapClientNetworkFetchTotal: number;
  homeSyncNetworkFetch: number;
  warmCallSiteInvocations: number;
  refreshInvocationTotal: number;
  refreshInvocationSilent: number;
  refreshInvocationNonSilent: number;
  homeRealtimeReactListenerDepth: number;
  homeRealtimeSupabaseChannelDepth: number;
  homeRealtimeMapEntries: number;
  homeRealtimeMapListenerRefs: number;
  messengerHomeDebugEvents: Record<string, number | undefined>;
};

async function readSnapshot(page: import("@playwright/test").Page): Promise<Snap | null> {
  return page.evaluate(() => {
    const w = window as unknown as { getMessengerHomeVerificationSnapshot?: () => Snap };
    return w.getMessengerHomeVerificationSnapshot ? w.getMessengerHomeVerificationSnapshot() : null;
  });
}

test.describe("messenger home verification counts", () => {
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(() => {
      try {
        sessionStorage.setItem("samarket:debug:runtime", "1");
      } catch {
        /* ignore */
      }
    });
  });

  test("bootstrap / refresh / subscribe — 숫자 스냅샷", async ({ page }) => {
    const user = process.env.E2E_TEST_USERNAME?.trim();
    const pass = process.env.E2E_TEST_PASSWORD ?? "";
    if (user && pass) {
      await page.goto("/", { waitUntil: "domcontentloaded" });
      const ok = await page.evaluate(
        async ({ username, password }) => {
          const r = await fetch("/api/test-login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ username, password }),
          });
          return r.ok;
        },
        { username: user, password: pass }
      );
      if (!ok) test.skip(true, "test-login returned non-OK (surface disabled or bad credentials)");
    }

    let bootstrapHttp = 0;
    let homeSyncHttp = 0;
    page.on("request", (req) => {
      const u = req.url();
      if (u.includes("/api/community-messenger/bootstrap")) bootstrapHttp += 1;
      if (u.includes("/api/community-messenger/home-sync")) homeSyncHttp += 1;
    });

    const snap = async (label: string) => {
      const s = await readSnapshot(page);
      // eslint-disable-next-line no-console
      console.log(`[${label}]`, JSON.stringify(s));
      return s;
    };

    await page.goto("/home", { waitUntil: "domcontentloaded" });
    await snap("after_home_first");

    const bootWait = page.waitForResponse(
      (r) => r.url().includes("/api/community-messenger/bootstrap") && r.request().method() === "GET",
      { timeout: 45_000 }
    );
    await page.goto("/community-messenger", { waitUntil: "domcontentloaded" });
    await bootWait.catch(() => undefined);
    await page.waitForTimeout(2000);
    const afterFirstMessenger = await snap("after_messenger_first_entry");
    expect(afterFirstMessenger).not.toBeNull();

    await page.goto("/home", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);
    const bootWait2 = page.waitForResponse(
      (r) => r.url().includes("/api/community-messenger/bootstrap") && r.request().method() === "GET",
      { timeout: 45_000 }
    );
    await page.goto("/community-messenger", { waitUntil: "domcontentloaded" });
    await bootWait2.catch(() => undefined);
    await page.waitForTimeout(2000);
    const afterSecondMessenger = await snap("after_messenger_second_entry");

    const refreshBeforeVis = afterSecondMessenger?.refreshInvocationTotal ?? -1;
    await page.evaluate(() => {
      try {
        Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
        document.dispatchEvent(new Event("visibilitychange"));
      } catch {
        /* ignore */
      }
    });
    await page.waitForTimeout(200);
    await page.evaluate(() => {
      try {
        Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
        document.dispatchEvent(new Event("visibilitychange"));
      } catch {
        /* ignore */
      }
    });
    await page.waitForTimeout(1500);
    const afterVisibility = await snap("after_visibility_toggle");

    const b0 = afterFirstMessenger!.bootstrapClientNetworkFetchTotal;
    const b1 = afterSecondMessenger!.bootstrapClientNetworkFetchTotal;
    const lite0 = afterFirstMessenger!.bootstrapClientNetworkFetch.lite;
    const lite1 = afterSecondMessenger!.bootstrapClientNetworkFetch.lite;

    const r0 = afterFirstMessenger!.refreshInvocationTotal;
    const r1 = afterSecondMessenger!.refreshInvocationTotal;
    const rVisDelta = (afterVisibility?.refreshInvocationTotal ?? 0) - refreshBeforeVis;

    const ev = (s: Snap) => s.messengerHomeDebugEvents;
    const subCreate0 = Number(ev(afterFirstMessenger!).messenger_home_subscribe_create ?? 0);
    const subClean0 = Number(ev(afterFirstMessenger!).messenger_home_subscribe_cleanup ?? 0);
    const subCreate1 = Number(ev(afterSecondMessenger!).messenger_home_subscribe_create ?? 0);
    const subClean1 = Number(ev(afterSecondMessenger!).messenger_home_subscribe_cleanup ?? 0);

    const ch0 = afterFirstMessenger!.homeRealtimeSupabaseChannelDepth;
    const ch1 = afterSecondMessenger!.homeRealtimeSupabaseChannelDepth;
    const rl0 = afterFirstMessenger!.homeRealtimeReactListenerDepth;
    const rl1 = afterSecondMessenger!.homeRealtimeReactListenerDepth;

    const visResume = Number(afterVisibility?.messengerHomeDebugEvents.messenger_home_visibility_resume ?? 0);

    // eslint-disable-next-line no-console
    console.log("\n=== MESSENGER_HOME_VERIFICATION_SUMMARY (numbers) ===");
    // eslint-disable-next-line no-console
    console.log(
      `bootstrap_network_total: first_entry=${b0} → after_tab_return=${b1} (lite: ${lite0}→${lite1})`
    );
    // eslint-disable-next-line no-console
    console.log(`bootstrap_http_requests(url_count): ${bootstrapHttp}`);
    // eslint-disable-next-line no-console
    console.log(`home_sync_http_requests(url_count): ${homeSyncHttp}`);
    // eslint-disable-next-line no-console
    console.log(`refresh_invocations_total: first_entry=${r0} → after_tab_return=${r1}`);
    // eslint-disable-next-line no-console
    console.log(`refresh_delta_on_visibility_cycle: ${rVisDelta}`);
    // eslint-disable-next-line no-console
    console.log(`visibility_resume_events_cumulative: ${visResume}`);
    // eslint-disable-next-line no-console
    console.log(
      `subscribe_debug_events: create ${subCreate0}→${subCreate1}, cleanup ${subClean0}→${subClean1}`
    );
    // eslint-disable-next-line no-console
    console.log(
      `realtime_gauges: reactListeners ${rl0}→${rl1}, supabaseChannelHandles ${ch0}→${ch1}, mapEntries ${afterFirstMessenger!.homeRealtimeMapEntries}→${afterSecondMessenger!.homeRealtimeMapEntries}`
    );
    // eslint-disable-next-line no-console
    console.log(
      `warm_call_sites: ${afterFirstMessenger!.warmCallSiteInvocations}→${afterSecondMessenger!.warmCallSiteInvocations}`
    );
    // eslint-disable-next-line no-console
    console.log("=== END ===\n");

    expect(afterSecondMessenger!.homeRealtimeReactListenerDepth).toBeLessThanOrEqual(2);
    expect(afterSecondMessenger!.homeRealtimeSupabaseChannelDepth).toBeLessThanOrEqual(200);
  });
});
