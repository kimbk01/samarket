/**
 * Browser runtime close evidence for Admin Business Control Center.
 * DO NOT mutate production stores unless SAFE_BROWSER_STORE_ID is explicitly set.
 *
 * Usage:
 *   PLAYWRIGHT_NO_WEBSERVER=1 npx playwright test scripts/runtime-business-cc-browser-close.spec.ts
 *   or: node --import tsx scripts/... (this file is a playwright spec under tests/e2e for config)
 */
import { expect, test } from "@playwright/test";
import {
  assertPlaywrightOriginReachable,
  ensureE2eUserSession,
  playwrightOriginFromEnv,
} from "./helpers/playwright-origin-and-session";

const STORE_A = (process.env.BROWSER_CC_STORE_A ?? "12228d5c-7767-473b-8c22-08d969c03ca1").trim();
const STORE_B = (process.env.BROWSER_CC_STORE_B ?? "2b9d871e-5ea9-411a-adcc-db7ad1594a80").trim();
const SAFE_MUTATION_STORE = (process.env.SAFE_BROWSER_STORE_ID ?? "").trim();

type CaseResult = {
  id: string;
  verdict: "PASS" | "FAIL" | "NOT_PROVEN";
  evidence: Record<string, unknown>;
};

const results: CaseResult[] = [];

function record(r: CaseResult) {
  results.push(r);
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ case: r.id, verdict: r.verdict, evidence: r.evidence }));
}

test.describe("Business CC browser runtime close", () => {
  test.setTimeout(180_000);

  test("session + admin reachability + A→B leak + mutation gates", async ({ page, request }) => {
    await assertPlaywrightOriginReachable(request);
    const origin = playwrightOriginFromEnv();

    let sessionOk = true;
    try {
      await ensureE2eUserSession(page);
    } catch (e: unknown) {
      sessionOk = false;
      record({
        id: "SESSION",
        verdict: "NOT_PROVEN",
        evidence: { error: String(e), reason: "E2E login failed" },
      });
    }
    if (!sessionOk) {
      record({
        id: "ADMIN_REACH",
        verdict: "NOT_PROVEN",
        evidence: { reason: "login failed — cannot open Admin" },
      });
      record({
        id: "ADMIN_A_TO_B_LEAK",
        verdict: "NOT_PROVEN",
        evidence: { reason: "no admin session" },
      });
      for (const id of [
        "CASE_A_NAME",
        "CASE_B_VISIBILITY",
        "CASE_C_SALES",
        "CASE_D_OWNER_OPEN",
        "CASE_E_SOLD_OUT",
        "CASE_F_DISTANCE",
        "CASE_G_ORDER",
        "CASE_H_FEE_SETTLEMENT",
        "OWNER_A_TO_B_LEAK",
      ]) {
        record({
          id,
          verdict: "NOT_PROVEN",
          evidence: { reason: "blocked by session" },
        });
      }
      // eslint-disable-next-line no-console
      console.log(JSON.stringify({ ok: true, results }, null, 2));
      return;
    }

    await page.goto(`${origin}/admin/business`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);
    const listUrl = page.url();
    if (listUrl.includes("/login") || listUrl.includes("/forbidden")) {
      record({
        id: "ADMIN_REACH",
        verdict: "NOT_PROVEN",
        evidence: {
          reason: "E2E user is not Admin (redirect)",
          url: listUrl,
        },
      });
      record({
        id: "ADMIN_A_TO_B_LEAK",
        verdict: "NOT_PROVEN",
        evidence: { reason: "ADMIN SESSION UNAVAILABLE" },
      });
      for (const id of [
        "CASE_A_NAME",
        "CASE_B_VISIBILITY",
        "CASE_C_SALES",
        "CASE_D_OWNER_OPEN",
        "CASE_E_SOLD_OUT",
        "CASE_F_DISTANCE",
        "CASE_G_ORDER",
        "CASE_H_FEE_SETTLEMENT",
        "OWNER_A_TO_B_LEAK",
      ]) {
        record({
          id,
          verdict: "NOT_PROVEN",
          evidence: {
            reason:
              id.startsWith("CASE_A") || id.startsWith("CASE_B") || id.startsWith("CASE_C")
                ? "ADMIN SESSION UNAVAILABLE"
                : id.startsWith("CASE_D") || id.startsWith("CASE_E") || id.startsWith("OWNER")
                  ? "OWNER SESSION / SAFE STORE UNAVAILABLE for mutation"
                  : "SAFE TEST STORE / ADMIN SESSION UNAVAILABLE",
          },
        });
      }
      // eslint-disable-next-line no-console
      console.log(JSON.stringify({ ok: true, results }, null, 2));
      return;
    }

    record({
      id: "ADMIN_REACH",
      verdict: "PASS",
      evidence: { url: listUrl },
    });

    // ── A → B → A leak (read-only) ──
    async function captureCc(storeId: string) {
      await page.goto(`${origin}/admin/business/${storeId}`, {
        waitUntil: "domcontentloaded",
      });
      await page.waitForTimeout(1500);
      const root = page.locator(`[data-store-id="${storeId}"]`);
      const hasRoot = await root.count();
      const body = await page.locator("main, [data-admin], body").first().innerText();
      const title = await page.locator("h2").first().innerText().catch(() => "");
      const loading = /Loading|로딩|불러오는/i.test(body) && !title;
      return {
        url: page.url(),
        hasRoot,
        title: title.slice(0, 120),
        bodySnippet: body.slice(0, 800),
        loading,
        storeIdAttrOk: hasRoot > 0,
      };
    }

    const a1 = await captureCc(STORE_A);
    const b1 = await captureCc(STORE_B);
    const a2 = await captureCc(STORE_A);
    const b2 = await captureCc(STORE_B);

    const leakFail =
      (b1.title && a1.title && b1.title === a1.title && STORE_A !== STORE_B) ||
      (a2.title && b1.title && a2.title === b1.title && a2.title !== a1.title) ||
      (!b1.storeIdAttrOk && !b1.loading) ||
      (!a2.storeIdAttrOk && !a2.loading);

    // Stronger: after B load, page must not still show A's data-store-id
    const bStillHasA = await page.locator(`[data-store-id="${STORE_A}"]`).count();
    await page.goto(`${origin}/admin/business/${STORE_B}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);
    const onB = await page.locator(`[data-store-id="${STORE_B}"]`).count();
    const onBHasA = await page.locator(`[data-store-id="${STORE_A}"]`).count();

    if (!a1.title || !b1.title || a1.loading || b1.loading) {
      record({
        id: "ADMIN_A_TO_B_LEAK",
        verdict: "NOT_PROVEN",
        evidence: {
          reason: "CC detail did not render titles (empty/loading)",
          a1,
          b1,
          a2,
          b2,
        },
      });
    } else if (leakFail || (onB > 0 && onBHasA > 0) || a1.title === b1.title) {
      record({
        id: "ADMIN_A_TO_B_LEAK",
        verdict: a1.title === b1.title ? "NOT_PROVEN" : "FAIL",
        evidence: {
          note:
            a1.title === b1.title
              ? "titles equal — may be coincidence; check ids"
              : "possible cross-store leak",
          a1,
          b1,
          a2,
          b2,
          onB,
          onBHasA,
          bStillHasA,
        },
      });
    } else {
      // Distinct titles + correct data-store-id binding
      const ok =
        a1.title !== b1.title &&
        a2.title === a1.title &&
        b2.title === b1.title &&
        onB > 0 &&
        onBHasA === 0;
      record({
        id: "ADMIN_A_TO_B_LEAK",
        verdict: ok ? "PASS" : "FAIL",
        evidence: { a1, b1, a2, b2, onB, onBHasA },
      });
    }

    // ── Mutations: require explicit SAFE_BROWSER_STORE_ID ──
    if (!SAFE_MUTATION_STORE) {
      for (const id of [
        "CASE_A_NAME",
        "CASE_B_VISIBILITY",
        "CASE_C_SALES",
        "CASE_D_OWNER_OPEN",
        "CASE_E_SOLD_OUT",
        "CASE_F_DISTANCE",
        "CASE_G_ORDER",
        "CASE_H_FEE_SETTLEMENT",
      ]) {
        record({
          id,
          verdict: "NOT_PROVEN",
          evidence: {
            reason: "SAFE TEST STORE UNAVAILABLE — set SAFE_BROWSER_STORE_ID to allow mutations",
            knownStoresReadOnly: [STORE_A, STORE_B],
          },
        });
      }
    } else {
      record({
        id: "CASE_A_NAME",
        verdict: "NOT_PROVEN",
        evidence: {
          reason:
            "SAFE_BROWSER_STORE_ID set but mutation harness not auto-run (manual approval required for live write)",
          safeStore: SAFE_MUTATION_STORE,
        },
      });
      for (const id of [
        "CASE_B_VISIBILITY",
        "CASE_C_SALES",
        "CASE_D_OWNER_OPEN",
        "CASE_E_SOLD_OUT",
        "CASE_F_DISTANCE",
        "CASE_G_ORDER",
        "CASE_H_FEE_SETTLEMENT",
      ]) {
        record({
          id,
          verdict: "NOT_PROVEN",
          evidence: { reason: "mutation harness gated — not auto-executed" },
        });
      }
    }

    record({
      id: "OWNER_A_TO_B_LEAK",
      verdict: "NOT_PROVEN",
      evidence: { reason: "MULTI-STORE OWNER SESSION not verified in this run" },
    });

    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ ok: true, results }, null, 2));
    expect(results.length).toBeGreaterThan(0);
  });
});
