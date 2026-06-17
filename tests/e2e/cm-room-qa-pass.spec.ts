/**
 * Community messenger room QA — mobile WebKit/Chromium + structured log capture.
 */
import { test, expect, devices, type Browser, type Page } from "@playwright/test";
import { ensureE2eUserSession, playwrightOriginFromEnv } from "./helpers/playwright-origin-and-session";

type LogLine = { tag: string; event: string; raw: string };

function captureStructuredLog(text: string): LogLine | null {
  const m = text.match(/\[chat-room-(timeline|scroll)\]\s+(\S+)/);
  if (!m) return null;
  return {
    tag: `[chat-room-${m[1]}]`,
    event: m[2]!,
    raw: text,
  };
}

  const REQUIRED_SCROLL = [
    "composer_height_changed",
    "near_bottom_false",
    "near_bottom_true",
    "new_messages_chip_show",
    "new_messages_chip_hide",
    "auto_stick_skipped_user_scrolled_up",
  ] as const;

const REQUIRED_TIMELINE = ["initial_fetch_start", "initial_fetch_done"] as const;

async function dismissBlockingModals(page: Page): Promise<void> {
  const callPerm = page.locator('[aria-labelledby="dibay-call-permission-modal-title"]');
  if (await callPerm.isVisible().catch(() => false)) {
    await page.getByRole("button", { name: /나중에|Not now/i }).click();
    await page.waitForTimeout(250);
  }
}

async function runRoomQaProfile(
  browser: Browser,
  label: string,
  device: (typeof devices)[keyof typeof devices]
): Promise<Record<string, unknown>> {
  const user = process.env.E2E_TEST_USERNAME?.trim() || "aaaa";
  const pass = process.env.E2E_TEST_PASSWORD ?? "1234";
  const origin = playwrightOriginFromEnv();
  const roomId = process.env.E2E_SNAPSHOT_DIAG_ROOM_ID?.trim();
  expect(roomId, "E2E_SNAPSHOT_DIAG_ROOM_ID — run node scripts/prepare-cm-pass0-e2e.mjs").toBeTruthy();

  const logs: LogLine[] = [];
  const context = await browser.newContext({ ...device });
  await context.addInitScript(() => {
    try {
      sessionStorage.setItem("samarket:debug:runtime", "1");
    } catch {
      /* ignore */
    }
  });
  const page = await context.newPage();
  page.on("console", (msg) => {
    const parsed = captureStructuredLog(msg.text());
    if (parsed) logs.push(parsed);
  });

  await ensureE2eUserSession(page, { username: user, password: pass });

  const roomPath = `/community-messenger/rooms/${encodeURIComponent(roomId!)}`;

  for (let reentry = 0; reentry < 3; reentry += 1) {
    await page.goto(`${origin}/community-messenger`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(400);
    await page.goto(`${origin}${roomPath}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("textarea, [data-cm-room-viewport-placeholder]", { timeout: 60_000 });
    await dismissBlockingModals(page);
    await page.waitForTimeout(800);
  }

  await dismissBlockingModals(page);

  const textarea = page.locator("textarea").first();
  await expect(textarea).toBeVisible({ timeout: 30_000 });
  await textarea.click();
  await page.waitForTimeout(300);

  for (let i = 0; i < 3; i += 1) {
    const msg = `qa-send-${Date.now()}-${i}`;
    await textarea.fill(msg);
    await page.locator("[data-cm-line-send-btn]").click();
    await page.waitForTimeout(700);
    await expect(textarea).toBeFocused();
  }

  const scrollBox = page.locator("[data-cm-message-viewport]").first();
  await expect(scrollBox).toBeVisible({ timeout: 30_000 });

  const scrollMetricsBeforeBurst = await scrollBox.evaluate((el) => {
    el.scrollTop = 0;
    el.dispatchEvent(new Event("scroll", { bubbles: true }));
    return {
      scrollTop: el.scrollTop,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      bottomDistance: el.scrollHeight - el.scrollTop - el.clientHeight,
    };
  });

  await page.evaluate(() => {
    const w = window as Window & { __cmPerfSyncScrollNearBottom?: () => boolean };
    w.__cmPerfSyncScrollNearBottom?.();
  });

  await page.waitForFunction(() => {
    const el = document.querySelector("[data-cm-message-viewport]");
    if (!el) return false;
    const bottomDistance = el.scrollHeight - el.scrollTop - el.clientHeight;
    return bottomDistance > 80;
  }, undefined, { timeout: 15_000 });

  await page.waitForFunction(() => {
    const w = window as Window & { __cmPerfSyncScrollNearBottom?: () => boolean };
    return typeof w.__cmPerfSyncScrollNearBottom === "function";
  }).catch(() => undefined);
  await page.evaluate(() => {
    const w = window as Window & { __cmPerfSyncScrollNearBottom?: () => boolean };
    w.__cmPerfSyncScrollNearBottom?.();
  });
  await page.waitForTimeout(200);

  const burstCount = 3;
  const burstOk = await page.evaluate((count) => {
    const w = window as Window & { __cmPerfSimulateRealtimeBurst?: (n: number) => unknown };
    if (!w.__cmPerfSimulateRealtimeBurst) return false;
    w.__cmPerfSimulateRealtimeBurst(count);
    return true;
  }, burstCount);
  await page.waitForTimeout(900);

  const scrollMetricsAfterBurst = await scrollBox.evaluate((el) => ({
    scrollTop: el.scrollTop,
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
    bottomDistance: el.scrollHeight - el.scrollTop - el.clientHeight,
  }));

  const chip = page.getByRole("button", { name: /새 메시지|new message/i });
  const chipWhenScrolledUp = burstOk ? await chip.isVisible().catch(() => false) : false;
  const chipLabel = burstOk && chipWhenScrolledUp ? (await chip.textContent())?.trim() ?? "" : "";

  if (burstOk) {
    expect(scrollMetricsBeforeBurst.bottomDistance, `${label}: scrolled up before burst`).toBeGreaterThan(80);
    expect(scrollMetricsAfterBurst.bottomDistance, `${label}: burst must not auto-stick to bottom`).toBeGreaterThan(80);
    expect(chipWhenScrolledUp, `${label}: scrolled up — chip`).toBe(true);
    expect(chipLabel, `${label}: chip count`).toMatch(/3|three/i);

    await chip.click();
    await page.waitForTimeout(500);
    const chipHiddenAfterClick = !(await chip.isVisible().catch(() => false));
    expect(chipHiddenAfterClick, `${label}: chip hide after click`).toBe(true);

    await scrollBox.evaluate((el) => {
      el.scrollTop = Math.max(0, el.scrollTop - 200);
      el.dispatchEvent(new Event("scroll", { bubbles: true }));
    });
    await page.evaluate(() => {
      const w = window as Window & { __cmPerfSyncScrollNearBottom?: () => boolean };
      w.__cmPerfSyncScrollNearBottom?.();
    });
    await scrollBox.evaluate((el) => {
      el.scrollTop = Math.max(0, el.scrollHeight - el.clientHeight);
      el.dispatchEvent(new Event("scroll", { bubbles: true }));
    });
    await page.evaluate(() => {
      const w = window as Window & { __cmPerfSyncScrollNearBottom?: () => boolean };
      w.__cmPerfSyncScrollNearBottom?.();
    });
    await page.waitForTimeout(200);
  }

  await scrollBox.evaluate((el) => {
    el.scrollTop = Math.max(0, el.scrollHeight - el.clientHeight);
    el.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
  await page.evaluate(() => {
    const w = window as Window & { __cmPerfSyncScrollNearBottom?: () => boolean };
    w.__cmPerfSyncScrollNearBottom?.();
  });
  await page.waitForTimeout(400);
  if (burstOk) {
    await page.evaluate(() => {
      const w = window as Window & { __cmPerfSimulateRealtimeBurst?: (n: number) => unknown };
      w.__cmPerfSimulateRealtimeBurst?.(1);
    });
    await page.waitForTimeout(900);
  }

  const events = [...new Set(logs.map((l) => l.event))];
  for (const req of REQUIRED_TIMELINE) {
    expect(events, `${label} missing ${req}`).toContain(req);
  }
  for (const req of REQUIRED_SCROLL) {
    expect(events, `${label} missing ${req}`).toContain(req);
  }

  await context.close();

  return {
    qa_profile: label,
    room_id: roomId,
    log_events: events,
    log_count: logs.length,
    burst_sim_available: burstOk,
    chip_when_scrolled_up: chipWhenScrolledUp,
    chip_label: chipLabel,
    scroll_before_burst: scrollMetricsBeforeBurst,
    scroll_after_burst: scrollMetricsAfterBurst,
  };
}

test.describe("cm room QA pass", () => {
  test("room QA — android_chrome", async ({ browser }) => {
    test.setTimeout(300_000);
    const report = await runRoomQaProfile(browser, "android_chrome", devices["Pixel 7"]);
    // eslint-disable-next-line no-console -- QA artifact
    console.log(JSON.stringify(report));
  });

  test("room QA — ios_safari", async ({ browser }) => {
    test.setTimeout(300_000);
    const report = await runRoomQaProfile(browser, "ios_safari", devices["iPhone 14"]);
    // eslint-disable-next-line no-console -- QA artifact
    console.log(JSON.stringify(report));
  });

  test("room QA — tablet_split", async ({ browser }) => {
    test.setTimeout(300_000);
    const report = await runRoomQaProfile(browser, "tablet_split", devices["iPad Pro 11"]);
    // eslint-disable-next-line no-console -- QA artifact
    console.log(JSON.stringify(report));
  });
});
