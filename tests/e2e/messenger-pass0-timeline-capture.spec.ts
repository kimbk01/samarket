/**
 * BN12-C — PASS0·room entry milestone E2E (측정·조사 전용, RoomOpening host 변경 없음).
 *
 * 준비:
 *   npm run dev
 *   node scripts/prepare-cm-pass0-e2e.mjs
 *
 * 실행:
 *   PLAYWRIGHT_NO_WEBSERVER=1 E2E_TEST_USERNAME=aaaa E2E_TEST_PASSWORD=1234 \
 *     npx playwright test tests/e2e/messenger-pass0-timeline-capture.spec.ts
 */
import { test, expect } from "@playwright/test";
import { ensureE2eUserSession, playwrightOriginFromEnv } from "./helpers/playwright-origin-and-session";
import {
  clickFirstMessengerRoomRow,
  waitForMessengerChatListReady,
} from "./helpers/messenger-pass0-timeline-capture";
import {
  installPass0MeasurementProbe,
  measurePass0Scenario,
  type Pass0ScenarioMeasurement,
} from "./helpers/messenger-pass0-measurement-probe";

test.describe("messenger PASS0 timeline capture (BN12-C)", () => {
  test.beforeEach(async ({ context, page }) => {
    await context.addInitScript(() => {
      try {
        sessionStorage.setItem("samarket:debug:runtime", "1");
      } catch {
        /* ignore */
      }
    });
    await installPass0MeasurementProbe(page);
  });

  test("room entry milestones — S1~S4 (JSON)", async ({ page }) => {
    test.setTimeout(360_000);
    const user = process.env.E2E_TEST_USERNAME?.trim() || "aaaa";
    const pass = process.env.E2E_TEST_PASSWORD ?? "1234";
    const origin = playwrightOriginFromEnv();
    const envRoom = process.env.E2E_SNAPSHOT_DIAG_ROOM_ID?.trim() ?? null;

    await ensureE2eUserSession(page, { username: user, password: pass });
    await page.evaluate(() => {
      try {
        sessionStorage.removeItem("samarket.messenger.bootstrap.v1");
      } catch {
        /* ignore */
      }
    });

    const scenarios: Pass0ScenarioMeasurement[] = [];

    scenarios.push(
      await measurePass0Scenario(page, "S1_cm_cold_list_tap", true, async () => {
        await page.goto(`${origin}/community-messenger`, { waitUntil: "domcontentloaded" });
        await waitForMessengerChatListReady(page);
        await page.waitForTimeout(500);
      }, async () => {
        await clickFirstMessengerRoomRow(page);
      })
    );

    scenarios.push(
      await measurePass0Scenario(page, "S2_mypage_cold_800ms_cm_list_tap", true, async () => {
        await page.goto(`${origin}/mypage`, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(800);
        await page.goto(`${origin}/community-messenger`, { waitUntil: "domcontentloaded" });
        await waitForMessengerChatListReady(page);
        await page.waitForTimeout(300);
      }, async () => {
        await clickFirstMessengerRoomRow(page);
      })
    );

    scenarios.push(
      await measurePass0Scenario(page, "S3_mypage_idle6s_warm_cm_list_tap", true, async () => {
        await page.goto(`${origin}/mypage`, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(6000);
        await page.goto(`${origin}/community-messenger`, { waitUntil: "domcontentloaded" });
        await waitForMessengerChatListReady(page);
        await page.waitForTimeout(300);
      }, async () => {
        await clickFirstMessengerRoomRow(page);
      })
    );

    if (envRoom) {
      scenarios.push(
        await measurePass0Scenario(page, "S4_mypage_direct_room_no_forward_nav", false, async () => {
          await page.goto(`${origin}/mypage`, { waitUntil: "domcontentloaded" });
          await page.waitForTimeout(800);
        }, async () => {
          await page.goto(`${origin}/community-messenger/rooms/${encodeURIComponent(envRoom)}`, {
            waitUntil: "domcontentloaded",
          });
        })
      );
    }

    const report = {
      measuredAt: new Date().toISOString(),
      harness: "milestone_poll_v6_bn14",
      E2E_SNAPSHOT_DIAG_ROOM_ID: envRoom,
      scenarios,
    };

    // eslint-disable-next-line no-console
    console.log("\n=== MESSENGER_PASS0_TIMELINE_JSON ===\n" + JSON.stringify(report, null, 2) + "\n=== END ===\n");

    for (const s of scenarios) {
      expect(s.pathname, `${s.scenario} room URL`).toMatch(/\/community-messenger\/rooms\//);
      expect(
        s.milestonesMs.roomShell ?? s.liveDom.roomShell,
        `${s.scenario} room shell`
      ).toBeTruthy();
    }
  });
});
