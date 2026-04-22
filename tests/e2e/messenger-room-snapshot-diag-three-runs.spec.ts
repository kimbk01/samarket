/**
 * 동일 방(목록 첫 행) 3회 진입 후 `#samarket-room-snapshot-diag` JSON 으로 snapshot Δ 를 수집한다.
 * 비프로덕션에서는 `samarket_e2e_room_diag=1` 쿠키로 계측을 켠다. 진단 본문은 `GET .../room-snapshot-diagnostics-e2e` 로 채운다.
 *
 * PLAYWRIGHT_NO_WEBSERVER=1 PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/messenger-room-snapshot-diag-three-runs.spec.ts
 */
import { expect, test } from "@playwright/test";
import { readDiagFromDom, waitForRoomSnapshotDiagReady } from "./helpers/messenger-room-snapshot-diag";

type Diag = {
  snapshotEntryMs?: number;
  snapshotQueryAParallelEndMs?: number;
  snapshotQueryBProfilesEndMs?: number;
  snapshotNormalizeStartMs?: number;
  snapshotNormalizeDoneMs?: number;
  snapshotPreReturnMs?: number;
  chatRoomDetailLoad?: {
    fetchPostRowForChatSellerMatch?: {
      fetchPostGapPostsDoneToR2DoneMs?: number;
      fetchPostGapR2DoneToRNarrowDoneMs?: number;
      fetchPostGapRNarrowDoneToRelationDoneMs?: number;
      fetchPostRelationAdoptedFrom?: string;
      fetchPostRRelRan?: boolean;
      fetchPostRRelHasError?: boolean;
      fetchPostRRelHasData?: boolean;
      fetchPostRAbsRan?: boolean;
      fetchPostRAbsHasError?: boolean;
      fetchPostRAbsHasData?: boolean;
      fetchPostRBareRan?: boolean;
      fetchPostRBareHasError?: boolean;
      fetchPostRBareHasData?: boolean;
      fetchPostRNarrowErrorCode?: string;
      fetchPostRNarrowErrorMessage?: string;
      fetchPostRRelErrorCode?: string;
      fetchPostRRelErrorMessage?: string;
      fetchPostRAbsErrorCode?: string;
      fetchPostRAbsErrorMessage?: string;
    };
  };
};

type PostMatchGaps = {
  fetchPostGapPostsDoneToR2DoneMs: number;
  fetchPostGapR2DoneToRNarrowDoneMs: number;
  fetchPostGapRNarrowDoneToRelationDoneMs: number;
};

function extractPostMatchGaps(d: Diag): PostMatchGaps | null {
  const m = d.chatRoomDetailLoad?.fetchPostRowForChatSellerMatch;
  if (
    m?.fetchPostGapPostsDoneToR2DoneMs == null ||
    m?.fetchPostGapR2DoneToRNarrowDoneMs == null ||
    m?.fetchPostGapRNarrowDoneToRelationDoneMs == null
  ) {
    return null;
  }
  return {
    fetchPostGapPostsDoneToR2DoneMs: m.fetchPostGapPostsDoneToR2DoneMs,
    fetchPostGapR2DoneToRNarrowDoneMs: m.fetchPostGapR2DoneToRNarrowDoneMs,
    fetchPostGapRNarrowDoneToRelationDoneMs: m.fetchPostGapRNarrowDoneToRelationDoneMs,
  };
}

function median3(a: number, b: number, c: number): number {
  const s = [a, b, c].sort((x, y) => x - y);
  return s[1]!;
}

/** `fetchPostRowForChatSellerMatch` 3 gap 이 채워지는 방(거래·crSame 분기)을 목록에서 찾는다 */
async function pickRoomIdWithFetchPostSellerMatchDiagnostics(
  page: import("@playwright/test").Page,
  origin: string
): Promise<string> {
  const maxRows = 16;
  let lastProbe: Diag = {};
  for (let nth = 0; nth < maxRows; nth += 1) {
    await gotoWithRetry(page, `${origin}/community-messenger`);
    try {
      await page.waitForResponse(
        (r) => r.url().includes("/api/community-messenger/bootstrap") && r.request().method() === "GET",
        { timeout: 60_000 }
      );
    } catch {
      /* 목록이 캐시만 쓰는 경우 응답 없을 수 있음 */
    }
    const links = page.locator('a[href^="/community-messenger/rooms/"]');
    const rows = page.locator('[data-messenger-chat-row="true"]');
    const linkCount = await links.count();
    const rowCount = await rows.count();
    if (linkCount > nth) {
      await links.nth(nth).waitFor({ state: "visible", timeout: 60_000 });
      await links.nth(nth).click();
    } else if (rowCount > nth) {
      const row = rows.nth(nth);
      await row.waitFor({ state: "visible", timeout: 60_000 });
      const box = await row.boundingBox();
      expect(box, `행 ${nth} boundingBox`).toBeTruthy();
      await page.mouse.click(box!.x + Math.min(120, box!.width / 2), box!.y + box!.height / 2);
    } else {
      break;
    }
    await page.waitForFunction(
      () => /\/community-messenger\/rooms\//.test(window.location.href),
      undefined,
      { timeout: 60_000 }
    );
    /** 클라이언트 전환만 하면 스냅샷 `<script>` 가 안 붙을 수 있어 전체 문서 로드로 RSC 재실행 */
    await page.goto(page.url(), { waitUntil: "domcontentloaded" });
    await waitForRoomSnapshotDiagReady(page);
    const probe = (await readDiagFromDom(page)) as Diag;
    lastProbe = probe;
    if (extractPostMatchGaps(probe)) {
      const m = page.url().match(/\/community-messenger\/rooms\/([^/?#]+)/);
      expect(m?.[1], "방 URL 에서 roomId 추출").toBeTruthy();
      return m![1]!;
    }
  }
  const clip = JSON.stringify({
    keys: Object.keys(lastProbe),
    chatRoomDetailLoad: lastProbe.chatRoomDetailLoad ?? null,
  }).slice(0, 900);
  throw new Error(
    "목록 16행 이내에 fetchPostRowForChatSellerMatch 계측이 붙는 방 없음 — 거래 메신저+product_chats crSame 분기 방 필요. 마지막 스냅샷: " +
      clip
  );
}

type DeltaRow = {
  run: number;
  A_minus_E: number | null;
  B_minus_A: number | null;
  Ns_minus_B: number | null;
  Nd_minus_Ns: number | null;
  Pr_minus_Nd: number | null;
};

function computeDeltas(d: Diag): Omit<DeltaRow, "run"> {
  const E = d.snapshotEntryMs ?? 0;
  const A = d.snapshotQueryAParallelEndMs;
  const B = d.snapshotQueryBProfilesEndMs;
  const Ns = d.snapshotNormalizeStartMs;
  const Nd = d.snapshotNormalizeDoneMs;
  const Pr = d.snapshotPreReturnMs;
  const safeSub = (x: number | undefined, y: number | undefined): number | null => {
    if (x == null || y == null || !Number.isFinite(x) || !Number.isFinite(y)) return null;
    return x - y;
  };
  return {
    A_minus_E: safeSub(A, E),
    B_minus_A: safeSub(B, A),
    Ns_minus_B: safeSub(Ns, B),
    Nd_minus_Ns: safeSub(Nd, Ns),
    Pr_minus_Nd: safeSub(Pr, Nd),
  };
}

async function gotoWithRetry(
  page: import("@playwright/test").Page,
  url: string,
  attempts = 3
): Promise<void> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
      return;
    } catch (e) {
      lastErr = e;
      if (i < attempts - 1) await page.waitForTimeout(2000);
    }
  }
  throw lastErr;
}

/**
 * 현재 document origin 기준 `fetch("/api/test-login", { credentials: "include" })` 로
 * HttpOnly 쿠키가 브라우저 저장소에 남도록 한다(`page.request` 단독은 RSC 요청과 쿠키가 어긋날 수 있음).
 */
async function testLoginViaFetch(
  page: import("@playwright/test").Page,
  baseURL: string,
  username: string,
  password: string
): Promise<void> {
  const origin = baseURL.replace(/\/$/, "");
  await page.goto(origin, { waitUntil: "domcontentloaded" });
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
  expect(false, `test-login 실패 (${lastErr}) — test_users·표면·PLAYWRIGHT_BASE_URL 과 dev origin 일치 확인`).toBe(true);
}

test.describe("messenger room snapshot diag 3 runs", () => {
  test("collect three room-entry delta rows", async ({ page, baseURL }) => {
    test.setTimeout(240_000);
    const user = process.env.E2E_TEST_USERNAME?.trim() || "aaaa";
    const pass = process.env.E2E_TEST_PASSWORD ?? "1234";

    const origin = baseURL ?? "http://localhost:3000";
    await testLoginViaFetch(page, origin, user, pass);
    await page.context().addCookies([
      { name: "samarket_e2e_room_diag", value: "1", url: `${origin}/`, sameSite: "Lax" },
    ]);
    const jarNames = (await page.context().cookies()).map((c) => c.name);
    expect(
      jarNames.some((n) => n === "kasama_dev_uid" || n === "kasama_dev_uid_pub"),
      `test-login 후 kasama 쿠키 없음: ${jarNames.join(",")}`
    ).toBe(true);

    const rows: DeltaRow[] = [];
    const postGapRows: PostMatchGaps[] = [];
    const envRoom = process.env.E2E_SNAPSHOT_DIAG_ROOM_ID?.trim();
    let roomId: string | null =
      envRoom && envRoom.length > 0 ? envRoom : null;

    for (let run = 1; run <= 3; run += 1) {
      /** `tradeRoomDetailEntryCache` TTL 8000ms — 캐시 히트 시 fetchPost 계측이 생략됨 */
      if (run > 1) await page.waitForTimeout(9000);
      await page.context().addCookies([
        { name: "samarket_e2e_room_diag", value: "1", url: `${origin}/`, sameSite: "Lax" },
      ]);
      if (roomId == null) {
        roomId = await pickRoomIdWithFetchPostSellerMatchDiagnostics(page, origin);
      } else {
        await page.goto(`${origin}/community-messenger/rooms/${encodeURIComponent(roomId)}`, {
          waitUntil: "domcontentloaded",
        });
      }
      await waitForRoomSnapshotDiagReady(page);
      const diag = (await readDiagFromDom(page)) as Diag;
      const d = computeDeltas(diag);
      rows.push({ run, ...d });
      const pg = extractPostMatchGaps(diag);
      expect(pg, `RUN ${run}: chatRoomDetailLoad.fetchPostRowForChatSellerMatch gap 3종 누락`).not.toBeNull();
      postGapRows.push(pg!);
      // eslint-disable-next-line no-console
      console.log(`SNAPSHOT_DIAG_RUN_${run}_JSON:` + JSON.stringify({ diag, deltas: d }));
      // eslint-disable-next-line no-console
      console.log(
        `RELATION_FALLBACK_GAP_RUN_${run}:` +
          JSON.stringify({
            postsDoneToR2DoneMs: pg!.fetchPostGapPostsDoneToR2DoneMs,
            r2DoneToRNarrowDoneMs: pg!.fetchPostGapR2DoneToRNarrowDoneMs,
            rNarrowDoneToRelationDoneMs: pg!.fetchPostGapRNarrowDoneToRelationDoneMs,
          })
      );
      const m = diag.chatRoomDetailLoad?.fetchPostRowForChatSellerMatch;
      const relLine = (ran: boolean | undefined, err: boolean | undefined, dat: boolean | undefined) =>
        ran ? `success=${err === false && dat === true}, hasError=${err === true}, hasData=${dat === true}` : "skipped";
      // eslint-disable-next-line no-console
      console.log(
        `RELATION_FALLBACK_OUTCOME_RUN_${run}:` +
          JSON.stringify({
            adopted: m?.fetchPostRelationAdoptedFrom,
            rRel: relLine(m?.fetchPostRRelRan, m?.fetchPostRRelHasError, m?.fetchPostRRelHasData),
            rAbs: relLine(m?.fetchPostRAbsRan, m?.fetchPostRAbsHasError, m?.fetchPostRAbsHasData),
            rBare: relLine(m?.fetchPostRBareRan, m?.fetchPostRBareHasError, m?.fetchPostRBareHasData),
          })
      );
      // eslint-disable-next-line no-console
      console.log(
        `FETCHPOST_POSTGREST_ERRORS_RUN_${run}:` +
          JSON.stringify({
            rNarrow: { code: m?.fetchPostRNarrowErrorCode, message: m?.fetchPostRNarrowErrorMessage },
            rRel: { code: m?.fetchPostRRelErrorCode, message: m?.fetchPostRRelErrorMessage },
            rAbs: { code: m?.fetchPostRAbsErrorCode, message: m?.fetchPostRAbsErrorMessage },
          })
      );
    }

    // eslint-disable-next-line no-console
    console.log("SNAPSHOT_DIAG_THREE_RUNS_TABLE_JSON:" + JSON.stringify(rows));

    for (const r of rows) {
      expect(r.A_minus_E).not.toBeNull();
      expect(r.B_minus_A).not.toBeNull();
    }

    const g1 = postGapRows.map((x) => x.fetchPostGapPostsDoneToR2DoneMs);
    const g2 = postGapRows.map((x) => x.fetchPostGapR2DoneToRNarrowDoneMs);
    const g3 = postGapRows.map((x) => x.fetchPostGapRNarrowDoneToRelationDoneMs);
    const m1 = median3(g1[0]!, g1[1]!, g1[2]!);
    const m2 = median3(g2[0]!, g2[1]!, g2[2]!);
    const m3 = median3(g3[0]!, g3[1]!, g3[2]!);
    const segments: { name: string; med: number; three: [number, number, number] }[] = [
      { name: "posts_done → r2_done", med: m1, three: [g1[0]!, g1[1]!, g1[2]!] },
      { name: "r2_done → rNarrow_done", med: m2, three: [g2[0]!, g2[1]!, g2[2]!] },
      { name: "rNarrow_done → relation_done", med: m3, three: [g3[0]!, g3[1]!, g3[2]!] },
    ];
    const slowest = segments.reduce((a, b) => (b.med > a.med ? b : a));
    // eslint-disable-next-line no-console
    console.log(
      "RELATION_FALLBACK_SLOWEST_SEGMENT_JSON:" +
        JSON.stringify({
          segment: slowest.name,
          three: slowest.three,
          medianMs: slowest.med,
        })
    );
  });
});
