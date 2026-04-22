import type { Page } from "@playwright/test";

/**
 * RSC 인라인 진단 제거 후: 전용 API 로 스냅샷 진단 JSON 을 받아 `#samarket-room-snapshot-diag` 에 주입한다.
 */
export async function readDiagFromDom(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(() => {
    const el = document.getElementById("samarket-room-snapshot-diag");
    const raw =
      el?.textContent?.trim() ||
      (el instanceof HTMLScriptElement ? el.innerHTML?.trim() : "") ||
      "";
    if (!raw) return {};
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  });
}

export async function waitForRoomSnapshotDiagReady(page: Page): Promise<void> {
  await page.waitForFunction(
    async () => {
      const m = window.location.pathname.match(/\/community-messenger\/rooms\/([^/]+)/);
      const roomId = m?.[1];
      if (!roomId) return false;
      const res = await fetch(
        `/api/community-messenger/rooms/${encodeURIComponent(roomId)}/room-snapshot-diagnostics-e2e`,
        { credentials: "include", cache: "no-store" }
      );
      if (!res.ok) return false;
      const data = (await res.json()) as { ok?: boolean; diagnostics?: Record<string, unknown> };
      if (!data.ok || !data.diagnostics) return false;
      let el = document.getElementById("samarket-room-snapshot-diag");
      if (!el) {
        const s = document.createElement("script");
        s.id = "samarket-room-snapshot-diag";
        s.type = "application/json";
        document.body.appendChild(s);
        el = s;
      }
      (el as HTMLScriptElement).innerHTML = JSON.stringify(data.diagnostics);
      return true;
    },
    undefined,
    { timeout: 120_000 }
  );

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
    { timeout: 120_000 }
  );
}
