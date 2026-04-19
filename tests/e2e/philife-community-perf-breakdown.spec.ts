/**
 * community_list_* 분해 계측 실측 — sessionStorage samarket:debug:runtime=1
 * PLAYWRIGHT_NO_WEBSERVER=1 E2E_TEST_USERNAME=… E2E_TEST_PASSWORD=… npx playwright test tests/e2e/philife-community-perf-breakdown.spec.ts
 */
import { test, expect } from "@playwright/test";
import { SAMARKET_E2E_COMMUNITY_PHASE_SESSION_KEY } from "@/lib/runtime/samarket-runtime-debug";

type PhaseMs = Record<string, number>;

type FeedCapture = {
  scenario: string;
  url: string;
  status: number;
  bodyUtf8BytesApprox: number;
  postCount: number | null;
  imageFieldCountApprox: number | null;
  /** `waitForResponse` 등록 후 ~ Response 객체 수신까지(네비+서버+네트워크 상한에 가까움) */
  clientWaitForResponseMsApprox: number;
  /** `response.text()` 디코딩·문자열화 구간 */
  responseBodyReadMsApprox: number;
};

async function readPhaseMs(page: import("@playwright/test").Page): Promise<PhaseMs> {
  const inner = () =>
    page.evaluate((sessionKey: string) => {
      const probe = (window as unknown as { __samarketCommunityListPhaseProbe?: PhaseMs }).__samarketCommunityListPhaseProbe ?? {};
      const hook = (window as unknown as { samarketReadCommunityPhasesE2e?: () => PhaseMs }).samarketReadCommunityPhasesE2e;
      const fromHook = typeof hook === "function" ? hook() : {};
      const w = window as unknown as {
        getMessengerHomeVerificationSnapshot?: () => { appWidePhaseLastMs?: PhaseMs };
        __samarketPhilifePerfLast?: PhaseMs;
      };
      const snap = w.getMessengerHomeVerificationSnapshot?.();
      const a = snap?.appWidePhaseLastMs ?? {};
      const p = w.__samarketPhilifePerfLast ?? {};
      const raw = (globalThis as unknown as { __samarketAppWidePhaseLastMs?: PhaseMs }).__samarketAppWidePhaseLastMs ?? {};
      let fromSession: PhaseMs = {};
      try {
        const s = sessionStorage.getItem(sessionKey);
        if (s) fromSession = JSON.parse(s) as PhaseMs;
      } catch {
        /* ignore */
      }
      /** session 복제는 앱이 쓴 global 맵과 evaluate 가시성이 어긋날 때 최종 신뢰 소스 */
      return { ...raw, ...a, ...p, ...fromHook, ...probe, ...fromSession } as PhaseMs;
    }, SAMARKET_E2E_COMMUNITY_PHASE_SESSION_KEY);
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await inner();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("Execution context was destroyed")) throw e;
      await page.waitForTimeout(400);
    }
  }
  return {};
}

function pickCommunityPhases(p: PhaseMs): Record<string, number | null> {
  const keys = [
    "community_list_fetch_network_ms",
    "community_list_fetch_json_ms",
    "community_list_merge_ms",
    "community_list_render_prepare_ms",
    "community_list_paint_raf_ms",
    "community_list_fetch_ms",
    "community_list_to_paint_ms",
  ] as const;
  const out: Record<string, number | null> = {};
  for (const k of keys) {
    const v = p[k];
    out[k] = typeof v === "number" ? v : null;
  }
  return out;
}

async function parseFeedResponse(
  response: import("@playwright/test").Response
): Promise<Omit<FeedCapture, "scenario" | "clientWaitForResponseMsApprox">> {
  const t0 = Date.now();
  let text = "";
  try {
    text = await response.text();
  } catch {
    /* CDP: 본문 버퍼가 이미 비워진 경우(프리페치·리다이렉트 경합) */
  }
  const responseBodyReadMsApprox = Date.now() - t0;
  const bytes = new TextEncoder().encode(text).length;
  let postCount: number | null = null;
  let imgApprox = 0;
  try {
    const j = JSON.parse(text) as { posts?: unknown[] };
    if (Array.isArray(j.posts)) {
      postCount = j.posts.length;
      for (const row of j.posts) {
        if (row && typeof row === "object") {
          const o = row as Record<string, unknown>;
          if (o.image_url || o.imageUrl || o.cover_image_url) imgApprox += 1;
        }
      }
    }
  } catch {
    /* ignore */
  }
  return {
    url: response.url(),
    status: response.status(),
    bodyUtf8BytesApprox: bytes,
    postCount,
    imageFieldCountApprox: imgApprox > 0 ? imgApprox : null,
    responseBodyReadMsApprox,
  };
}

test.describe("Philife community perf breakdown", () => {
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(() => {
      try {
        sessionStorage.setItem("samarket:debug:runtime", "1");
      } catch {
        /* ignore */
      }
    });
    /** `page.evaluate` 가 앱 번들과 다른 realm 일 때 global phase 맵이 비어 보이는 문제 회피 — 메인 월드에 읽기 훅만 둔다 */
    await context.addInitScript(() => {
      try {
        Object.defineProperty(window, "samarketReadCommunityPhasesE2e", {
          configurable: true,
          enumerable: false,
          value: function samarketReadCommunityPhasesE2e() {
            const w = window as unknown as {
              getMessengerHomeVerificationSnapshot?: () => { appWidePhaseLastMs?: Record<string, number> };
              getAppWidePhaseLastMs?: () => Record<string, number>;
              __samarketPhilifePerfLast?: Record<string, number>;
            };
            const raw = (globalThis as unknown as { __samarketAppWidePhaseLastMs?: Record<string, number> })
              .__samarketAppWidePhaseLastMs ?? {};
            const a = w.getMessengerHomeVerificationSnapshot?.()?.appWidePhaseLastMs ?? {};
            const p = w.__samarketPhilifePerfLast ?? {};
            const d = w.getAppWidePhaseLastMs?.() ?? {};
            return { ...raw, ...a, ...p, ...d };
          },
        });
      } catch {
        /* ignore */
      }
    });
  });

  test("첫 진입·재진입·홈 후 복귀 ×2 — 숫자 표", async ({ page, baseURL }) => {
    /** run2 첫 단계가 동일 URL goto면 피드가 재발행되지 않아 waitForResponse 60s×N 누적로 타임아웃날 수 있음 */
    test.setTimeout(600_000);
    const user = process.env.E2E_TEST_USERNAME?.trim() ?? "";
    const pass = process.env.E2E_TEST_PASSWORD ?? "";
    test.skip(!user || !pass, "E2E_TEST_USERNAME / E2E_TEST_PASSWORD 필요");

    const origin = baseURL ?? "http://localhost:3000";
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    const loginOk = await page.evaluate(
      async ({ origin: o, username, password }) => {
        const r = await fetch(`${o}/api/test-login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ username, password }),
        });
        return r.ok;
      },
      { origin, username: user, password: pass }
    );
    expect(loginOk, "test-login 실패 — E2E_TEST_USERNAME·E2E_TEST_PASSWORD·test_users 확인").toBe(true);

    page.on("console", (msg) => {
      const t = msg.text();
      if (t.includes("[community-feed:perf-diag]") || t.includes("[samarket-runtime-debug:phase]")) {
        // eslint-disable-next-line no-console
        console.log("BROWSER_DIAG", t);
      }
    });

    const captures: FeedCapture[] = [];
    const rows: { label: string; phases: Record<string, number | null>; feed?: FeedCapture }[] = [];

    const settlePhilife = async (label: string, mode: "goto" | "reload") => {
      await page.evaluate(
        ({ sessionKey, runtimeKey }: { sessionKey: string; runtimeKey: string }) => {
          try {
            sessionStorage.setItem(runtimeKey, "1");
            sessionStorage.removeItem(sessionKey);
          } catch {
            /* ignore */
          }
        },
        { sessionKey: SAMARKET_E2E_COMMUNITY_PHASE_SESSION_KEY, runtimeKey: "samarket:debug:runtime" }
      );
      const waitT0 = Date.now();
      const feedResponsePromise = page
        .waitForResponse(
          (r) => r.url().includes("/api/philife/neighborhood-feed") && r.request().method() === "GET",
          { timeout: 45_000 }
        )
        .catch(() => null);
      if (mode === "reload") {
        await page.reload({ waitUntil: "domcontentloaded" });
      } else {
        await page.goto(`${origin}/philife`, { waitUntil: "domcontentloaded" });
      }
      const response = await feedResponsePromise;
      const clientWaitForResponseMsApprox = Date.now() - waitT0;
      let feed: FeedCapture | undefined;
      if (response) {
        const parsed = await parseFeedResponse(response);
        feed = {
          scenario: label,
          ...parsed,
          clientWaitForResponseMsApprox,
        };
        captures.push(feed);
      }
      /**
       * 긴 고정 대기 후에만 읽으면 dev HMR·모듈 교체 등으로 global phase 맵이 비는 타이밍과 겹칠 수 있음.
       * 응답 직후부터 짧은 간격으로 폴링해 community_list_fetch_network_ms 를 먼저 잡는다.
       */
      await page.waitForTimeout(300);
      let rawPhases = await readPhaseMs(page);
      for (let i = 0; i < 40 && rawPhases.community_list_fetch_network_ms == null; i++) {
        await page.waitForTimeout(200);
        rawPhases = await readPhaseMs(page);
      }
      /** double rAF 구간 반영 */
      await page.waitForTimeout(1200);
      rawPhases = await readPhaseMs(page);
      const phases = pickCommunityPhases(rawPhases);
      rows.push({ label, phases, feed });
      if (rows.length === 1) {
        const probe = await page.evaluate(() => {
          const g = globalThis as unknown as {
            __samarketAppWidePerfCounts?: Record<string, number>;
            __samarketAppWidePhaseLastMs?: Record<string, number>;
          };
          const snap = (
            window as unknown as {
              getMessengerHomeVerificationSnapshot?: () => {
                appWidePerf?: Record<string, number>;
                appWidePhaseLastMs?: Record<string, number>;
              };
            }
          ).getMessengerHomeVerificationSnapshot?.();
          return {
            debugFlag: sessionStorage.getItem("samarket:debug:runtime"),
            hasSnap: typeof (window as unknown as { getMessengerHomeVerificationSnapshot?: () => unknown }).getMessengerHomeVerificationSnapshot === "function",
            appWidePerf: snap?.appWidePerf ?? null,
            phaseKeys: snap?.appWidePhaseLastMs ? Object.keys(snap.appWidePhaseLastMs) : [],
            philifePerfLast: (window as unknown as { __samarketPhilifePerfLast?: unknown }).__samarketPhilifePerfLast ?? null,
            rawGlobalPerfKeys: g.__samarketAppWidePerfCounts ? Object.keys(g.__samarketAppWidePerfCounts) : [],
            rawGlobalPhaseKeys: g.__samarketAppWidePhaseLastMs ? Object.keys(g.__samarketAppWidePhaseLastMs) : [],
          };
        });
        // eslint-disable-next-line no-console
        console.log("=== PHILIFE_DEBUG_PROBE ===", JSON.stringify(probe));
      }
    };

    for (let run = 1; run <= 2; run++) {
      // eslint-disable-next-line no-console
      console.log(`\n--- philife perf cycle run ${run} ---\n`);
      if (run > 1) {
        await page.goto(`${origin}/home`, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(800);
      }
      await settlePhilife(`run${run}_philife_first_entry`, "goto");
      await settlePhilife(`run${run}_philife_reentry_same_nav`, "reload");
      await page.goto(`${origin}/home`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1200);
      await settlePhilife(`run${run}_philife_after_home_return`, "goto");
    }

    // eslint-disable-next-line no-console
    console.log("\n=== PHILIFE_COMMUNITY_PERF_ROWS ===\n", JSON.stringify(rows, null, 2));
    // eslint-disable-next-line no-console
    console.log("\n=== PHILIFE_NEIGHBORHOOD_FEED_CAPTURES ===\n", JSON.stringify(captures, null, 2), "\n=== END ===\n");

    expect(rows.length).toBeGreaterThanOrEqual(6);
    const withNetwork = rows.find((r) => r.phases.community_list_fetch_network_ms != null);
    expect(withNetwork, "community_list_fetch_network_ms 가 한 번도 기록되지 않음").toBeTruthy();
  });
});
