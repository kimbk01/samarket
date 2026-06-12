/**
 * BN14-3 prep — S4 direct cold only (dev/prod streaming 검증, 3회).
 *
 * 준비:
 *   dev:  npm run dev
 *   prod: npm run build && PORT=3001 npm run start
 *
 * 실행:
 *   node scripts/measure-cm-s4-direct-cold.mjs --mode=dev
 *   node scripts/measure-cm-s4-direct-cold.mjs --mode=prod
 */
import { test, expect } from "@playwright/test";
import { ensureE2eUserSession, playwrightOriginFromEnv } from "./helpers/playwright-origin-and-session";
import {
  installPass0MeasurementProbe,
  measurePass0Scenario,
  type Pass0ScenarioMeasurement,
} from "./helpers/messenger-pass0-measurement-probe";

const RUNS = Number(process.env.S4_MEASURE_RUNS ?? "3");

test.describe("messenger PASS0 S4 direct cold (BN14-3 prep)", () => {
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

  test(`S4 direct cold x${RUNS} — html flush breakdown`, async ({ page }) => {
    test.setTimeout(300_000);
    const user = process.env.E2E_TEST_USERNAME?.trim() || "aaaa";
    const pass = process.env.E2E_TEST_PASSWORD ?? "1234";
    const origin = playwrightOriginFromEnv();
    const envRoom = process.env.E2E_SNAPSHOT_DIAG_ROOM_ID?.trim();
    expect(envRoom, "E2E_SNAPSHOT_DIAG_ROOM_ID required").toBeTruthy();

    await ensureE2eUserSession(page, { username: user, password: pass });

    const runs: Pass0ScenarioMeasurement[] = [];
    for (let i = 0; i < RUNS; i += 1) {
      runs.push(
        await measurePass0Scenario(page, `S4_mypage_direct_room_no_forward_nav_run${i + 1}`, false, async () => {
          await page.goto(`${origin}/mypage`, { waitUntil: "domcontentloaded" });
          await page.waitForTimeout(800);
        }, async () => {
          await page.goto(`${origin}/community-messenger/rooms/${encodeURIComponent(envRoom!)}`, {
            waitUntil: "domcontentloaded",
          });
        })
      );
      if (i < RUNS - 1) {
        await page.goto(`${origin}/mypage`, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(400);
      }
    }

    const mode = process.env.CM_S4_MEASURE_MODE ?? "unknown";
    const report = {
      measuredAt: new Date().toISOString(),
      harness: "milestone_poll_v6_bn14_s4_only",
      mode,
      origin,
      E2E_SNAPSHOT_DIAG_ROOM_ID: envRoom,
      runs: runs.map((r) => ({
        scenario: r.scenario,
        pathname: r.pathname,
        derived: r.derived,
        milestonesMs: {
          pathRoom: r.milestonesMs.pathRoom ?? null,
          segmentShellHost: r.milestonesMs.segmentShellHost ?? null,
          layoutInlineShell: r.milestonesMs.layoutInlineShell ?? null,
          routeEntryShell: r.milestonesMs.routeEntryShell ?? null,
        },
        s4DirectColdBreakdown: r.s4DirectColdBreakdown,
      })),
    };

    // eslint-disable-next-line no-console
    console.log("\n=== MESSENGER_PASS0_S4_DIRECT_COLD_JSON ===\n" + JSON.stringify(report, null, 2) + "\n=== END ===\n");

    const validRuns = runs.filter((r) => r.pathname.includes("/community-messenger/rooms/"));
    expect(validRuns.length, "valid S4 runs").toBeGreaterThanOrEqual(2);
    for (const r of validRuns) {
      expect(r.s4DirectColdBreakdown).toBeTruthy();
    }
  });
});
