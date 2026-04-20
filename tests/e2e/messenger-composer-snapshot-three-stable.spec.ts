/**
 * composer_wall_ms + 스냅샷 진단 3회 안정 재현 (측정 전용).
 *
 * [측정 루틴 고정] 방식 (둘 중 하나 통일 → 여기서는 **1번만** 사용):
 * - **런마다 `browser.newContext()`** 로 격리 (스토리지·클라이언트 라우터·RSC 잔류 제거).
 * - **`composer_wall_ms`**: 기본 목록(`MessengerChatListItem` 비-compact)은 **`<a href>` 없이** `role="button"` 만
 *   있어 `E2E_SNAPSHOT_DIAG_ROOM_ID` 행만 클릭하는 `measureChatRoomEntry` 동일 재현이 불가하다.
 *   → 본 스펙은 **고정 방 직접 `goto`** 로만 정의: `goto(/community-messenger/rooms/{id})` 직전 시각 → `textarea` 가시.
 * - **`fetchPostRelationAdoptedFrom`**: RSC 시드 진단 후 클라이언트가 `GET .../e2e-room-snapshot-diag` 로 trade 진단을 합류(첫 HTML과 분리).
 * - 스냅샷 JSON: `messenger-room-snapshot-diag-three-runs` 와 동일하게 `page.goto(page.url())` 후
 *   `#samarket-room-snapshot-diag` 가 채워질 때까지 대기 후 파싱.
 *
 * PLAYWRIGHT_NO_WEBSERVER=1 PLAYWRIGHT_BASE_URL=http://localhost:3000
 * E2E_SNAPSHOT_DIAG_ROOM_ID=<uuid> npx playwright test tests/e2e/messenger-composer-snapshot-three-stable.spec.ts
 */
import { expect, test } from "@playwright/test";
import {
  assertPlaywrightOriginAndTestLogin,
  gotoWithRetry,
} from "./helpers/playwright-origin-and-session";

type SnapshotDiag = {
  snapshotQueryAParallelEndMs?: number;
  normalizeSlowestNormalizeSubstepFromSummaryMs?: number;
  normalizeSlowestNormalizeSubstepName?: string;
  mappedMessagesSlowestSubstepName?: string;
  mappedMessagesSlowestSubstepMs?: number;
  chatRoomDetailLoad?: {
    fetchPostRowForChatSellerMatch?: {
      fetchPostRelationAdoptedFrom?: string;
    };
  };
};

async function testLoginViaFetch(
  page: import("@playwright/test").Page,
  baseURL: string,
  username: string,
  password: string
): Promise<void> {
  const origin = baseURL.replace(/\/$/, "");
  await gotoWithRetry(page, origin);
  let lastErr = "";
  for (let i = 0; i < 3; i += 1) {
    if (i > 0) await page.waitForTimeout(600);
    const ok = await page.evaluate(
      async ({ o, user, pass }) => {
        try {
          const res = await fetch(`${o}/api/test-login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ username: user, password: pass }),
          });
          const data = (await res.json()) as {
            ok?: boolean;
            userId?: string;
            username?: string;
            role?: string;
            error?: string;
          };
          if (!res.ok || !data?.ok || !data.userId || !data.username) {
            return `status=${res.status} body=${JSON.stringify(data)}`;
          }
          sessionStorage.setItem("test_user_id", data.userId);
          sessionStorage.setItem("test_username", data.username);
          sessionStorage.setItem("test_role", data.role || "member");
          try {
            document.cookie = `kasama_dev_uid_pub=${encodeURIComponent(data.userId)}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;
          } catch {
            /* ignore */
          }
          window.dispatchEvent(new Event("kasama-test-auth-changed"));
          return "";
        } catch (e) {
          return String(e);
        }
      },
      { o: origin, user: username, pass: password }
    );
    if (ok === "") return;
    lastErr = String(ok);
  }
  expect(false, `test-login 실패 (${lastErr})`).toBe(true);
}

async function readDiagFromDom(page: import("@playwright/test").Page): Promise<SnapshotDiag> {
  return page.evaluate(() => {
    const el = document.getElementById("samarket-room-snapshot-diag");
    const raw =
      el?.textContent?.trim() ||
      (el instanceof HTMLScriptElement ? el.innerHTML?.trim() : "") ||
      "";
    if (!raw) return {};
    try {
      return JSON.parse(raw) as SnapshotDiag;
    } catch {
      return {};
    }
  });
}

async function waitForRoomSnapshotDiagReady(page: import("@playwright/test").Page): Promise<void> {
  await page.locator("#samarket-room-snapshot-diag").waitFor({ state: "attached", timeout: 60_000 });
  await page.waitForFunction(
    () => {
      const el = document.getElementById("samarket-room-snapshot-diag");
      const raw =
        el?.textContent?.trim() ||
        (el instanceof HTMLScriptElement ? el.innerHTML?.trim() : "") ||
        "";
      if (!raw) return false;
      try {
        const j = JSON.parse(raw) as {
          snapshotQueryAParallelEndMs?: unknown;
          deferTradeDiagSkipped?: unknown;
          chatRoomDetailLoad?: {
            fetchPostRowForChatSellerMatch?: { fetchPostRelationAdoptedFrom?: unknown };
          };
        };
        if (typeof j.snapshotQueryAParallelEndMs !== "number") return false;
        const adopted = j.chatRoomDetailLoad?.fetchPostRowForChatSellerMatch?.fetchPostRelationAdoptedFrom;
        if (typeof adopted === "string" && adopted.trim().length > 0) return true;
        return j.deferTradeDiagSkipped === true;
      } catch {
        return false;
      }
    },
    undefined,
    { timeout: 60_000 }
  );
}

async function openFixedRoomOnce(
  browser: import("@playwright/test").Browser,
  origin: string,
  roomId: string,
  user: string,
  pass: string
): Promise<void> {
  const context = await browser.newContext();
  await context.addCookies([
    { name: "samarket_e2e_room_diag", value: "1", url: `${origin}/`, sameSite: "Lax" },
  ]);
  const page = await context.newPage();
  try {
    await testLoginViaFetch(page, origin, user, pass);
    const roomPath = `/community-messenger/rooms/${encodeURIComponent(roomId)}`;
    await gotoWithRetry(page, `${origin}${roomPath}`);
    await page.locator("textarea").first().waitFor({ state: "visible", timeout: 60_000 });
  } finally {
    await context.close();
  }
}

test.describe("messenger composer + snapshot three stable", () => {
  test.beforeAll(async ({ request }) => {
    const user = process.env.E2E_TEST_USERNAME?.trim() || "aaaa";
    const pass = process.env.E2E_TEST_PASSWORD ?? "1234";
    await assertPlaywrightOriginAndTestLogin(request, { username: user, password: pass });
  });

  test("three runs: new browser context each + fixed room URL (composer_wall_ms)", async ({ browser, baseURL }) => {
    test.setTimeout(300_000);
    const roomId = process.env.E2E_SNAPSHOT_DIAG_ROOM_ID?.trim();
    test.skip(!roomId, "E2E_SNAPSHOT_DIAG_ROOM_ID 가 필요합니다.");

    const user = process.env.E2E_TEST_USERNAME?.trim() || "aaaa";
    const pass = process.env.E2E_TEST_PASSWORD ?? "1234";
    const origin = (baseURL ?? "http://localhost:3000").replace(/\/$/, "");

    /** 서버·RSC 한 번 예열 — 진단 JSON 에 `fetchPostRelationAdoptedFrom` 가 안정적으로 붙는 경우가 많음 (측정 전용). */
    await openFixedRoomOnce(browser, origin, roomId, user, pass);
    /** `tradeRoomDetailEntryCache` TTL 8s — 측정 런 간과 동일하게 예열 직후에도 한 템포 둔다. */
    await new Promise((r) => setTimeout(r, 9000));

    const rows: Array<{
      run: number;
      composer_wall_ms: number;
      normalizeSlowestNormalizeSubstepFromSummaryMs: number | null;
      normalizeSlowestNormalizeSubstepName: string | null;
      mappedMessagesSlowestSubstepName: string | null;
      fetchPostRelationAdoptedFrom: string | null;
    }> = [];

    for (let run = 1; run <= 3; run += 1) {
      if (run > 1) {
        await new Promise((r) => setTimeout(r, 9000));
      }

      const context = await browser.newContext();
      await context.addCookies([
        { name: "samarket_e2e_room_diag", value: "1", url: `${origin}/`, sameSite: "Lax" },
      ]);
      const page = await context.newPage();
      try {
        await testLoginViaFetch(page, origin, user, pass);
        const jarNames = (await context.cookies()).map((c) => c.name);
        expect(
          jarNames.some((n) => n === "kasama_dev_uid" || n === "kasama_dev_uid_pub"),
          `test-login 후 kasama 쿠키 없음: ${jarNames.join(",")}`
        ).toBe(true);

        const roomPath = `/community-messenger/rooms/${encodeURIComponent(roomId)}`;
        const t0 = Date.now();
        await gotoWithRetry(page, `${origin}${roomPath}`);
        await page.locator("textarea").first().waitFor({ state: "visible", timeout: 60_000 });
        const composer_wall_ms = Date.now() - t0;

        await gotoWithRetry(page, page.url());
        await waitForRoomSnapshotDiagReady(page);
        const diag = await readDiagFromDom(page);

        const normalizeSlowestNormalizeSubstepFromSummaryMs =
          typeof diag.normalizeSlowestNormalizeSubstepFromSummaryMs === "number"
            ? diag.normalizeSlowestNormalizeSubstepFromSummaryMs
            : null;
        const normalizeSlowestNormalizeSubstepName =
          typeof diag.normalizeSlowestNormalizeSubstepName === "string"
            ? diag.normalizeSlowestNormalizeSubstepName
            : null;
        const fetchPostRelationAdoptedFrom =
          diag.chatRoomDetailLoad?.fetchPostRowForChatSellerMatch?.fetchPostRelationAdoptedFrom ?? null;
        const mappedMessagesSlowestSubstepName =
          typeof diag.mappedMessagesSlowestSubstepName === "string" ? diag.mappedMessagesSlowestSubstepName : null;

        const adopted =
          diag.chatRoomDetailLoad?.fetchPostRowForChatSellerMatch?.fetchPostRelationAdoptedFrom;
        expect(adopted, `RUN ${run}: fetchPostRelationAdoptedFrom`).toBeTruthy();
        expect(typeof adopted).toBe("string");
        expect(adopted.length).toBeGreaterThan(0);

        rows.push({
          run,
          composer_wall_ms,
          normalizeSlowestNormalizeSubstepFromSummaryMs,
          normalizeSlowestNormalizeSubstepName,
          mappedMessagesSlowestSubstepName,
          fetchPostRelationAdoptedFrom,
        });

        console.log(`STABLE_MEASURE_RUN_${run}_JSON:` + JSON.stringify(rows[rows.length - 1]));
      } finally {
        await context.close();
      }
    }

    console.log("STABLE_MEASURE_THREE_RUNS_TABLE_JSON:" + JSON.stringify(rows));

    for (const r of rows) {
      expect(r.composer_wall_ms, `RUN ${r.run}: composer_wall_ms`).toBeGreaterThan(0);
      expect(r.normalizeSlowestNormalizeSubstepFromSummaryMs, `RUN ${r.run}: normalizeSlowest ms`).not.toBeNull();
      expect(r.normalizeSlowestNormalizeSubstepName, `RUN ${r.run}: normalizeSlowest name`).toBeTruthy();
    }
    const fetchHits = rows.filter((r) => r.fetchPostRelationAdoptedFrom != null && String(r.fetchPostRelationAdoptedFrom).trim());
    console.log(
      "STABLE_MEASURE_FETCHPOST_HITS_JSON:" +
        JSON.stringify({ nonNullCount: fetchHits.length, runs: rows.map((r) => r.fetchPostRelationAdoptedFrom) })
    );
  });
});
