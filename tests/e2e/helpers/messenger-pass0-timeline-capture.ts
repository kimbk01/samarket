import type { Page } from "@playwright/test";

/** `CommunityMessengerRoomOpeningOverlayHost` dedicated chunk token */
export const ROOM_OPENING_HOST_CHUNK = "CommunityMessengerRoomOpeningOverlayHost_tsx";

export type Pass0ProbeEvent = {
  kind: string;
  relMs: number;
  extra?: Record<string, unknown>;
};

export type Pass0ShellConsolePayload = {
  overlay_visible_ms?: number | null;
  route_transition_started_ms?: number | null;
  route_mounted_ms?: number | null;
  hydration_complete_ms?: number | null;
  handoff_ms?: number | null;
  roomId?: string | null;
};

export type Pass0HostResourceTiming = {
  startMs: number;
  durationMs: number;
  responseEndMs: number;
};

export type Pass0TimelineSnapshot = {
  pathname: string;
  hostChunkLoadedBeforeTap: boolean;
  hostResourceTimings: Pass0HostResourceTiming[];
  preRouteShellDomSeen: boolean;
  roomDomSeen: boolean;
  roomPass0Attr: string | null;
  events: Pass0ProbeEvent[];
  shellConsolePayloads: Pass0ShellConsolePayload[];
};

declare global {
  interface Window {
    __samarketPass0Probe?: {
      t0: number;
      events: Pass0ProbeEvent[];
      domFlags: { preRoute: boolean; room: boolean; roomPass0: string | null };
    };
  }
}

/** 페이지 로드 전 1회 — tap t0·DOM·이벤트 수집 */
export async function installPass0TimelineProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__samarketPass0Probe = {
      t0: 0,
      events: [],
      domFlags: { preRoute: false, room: false, roomPass0: null },
    };
    const push = (kind: string, extra?: Record<string, unknown>) => {
      const probe = window.__samarketPass0Probe;
      if (!probe) return;
      const relMs = probe.t0 > 0 ? performance.now() - probe.t0 : 0;
      probe.events.push({ kind, relMs, extra });
    };
    const scan = () => {
      const probe = window.__samarketPass0Probe;
      if (!probe) return;
      if (!probe.domFlags.preRoute && document.querySelector("[data-cm-pre-route-shell]")) {
        probe.domFlags.preRoute = true;
        push("dom_pre_route_shell");
      }
      const room = document.querySelector("[data-cm-room]");
      if (room && !probe.domFlags.room) {
        probe.domFlags.room = true;
        probe.domFlags.roomPass0 = room.getAttribute("data-cm-room-pass0");
        push("dom_room", { pass0: probe.domFlags.roomPass0 });
      }
    };
    const mo = new MutationObserver(scan);
    mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
    const tick = () => {
      scan();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

export async function markPass0TimelineTapT0(page: Page): Promise<void> {
  await page.evaluate(() => {
    const probe = window.__samarketPass0Probe;
    if (!probe) return;
    probe.t0 = performance.now();
    probe.events.push({ kind: "tap_t0", relMs: 0 });
  });
}

/** 시나리오 간 probe·DOM 플래그 초기화 */
export async function resetPass0TimelineProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    const probe = window.__samarketPass0Probe;
    if (!probe) return;
    probe.t0 = 0;
    probe.events = [];
    probe.domFlags = { preRoute: false, room: false, roomPass0: null };
  });
}

export async function waitForMessengerChatListReady(page: Page, timeoutMs = 75_000): Promise<void> {
  const rows = page.locator('[data-messenger-chat-row="true"]');
  const empty = page.locator('[data-cm-home-empty-state="true"]');
  const reloadBtn = page.getByRole("button", { name: /^(Reload|새로고침|다시)/i });
  const deadline = Date.now() + timeoutMs;
  let reloadAttempts = 0;

  while (Date.now() < deadline) {
    if (await rows.first().isVisible().catch(() => false)) return;

    if (await empty.isVisible().catch(() => false)) {
      throw new Error(
        "메신저 채팅 목록이 비어 있음 — node scripts/prepare-cm-pass0-e2e.mjs 로 seed·E2E_SNAPSHOT_DIAG_ROOM_ID 확인"
      );
    }

    if (reloadAttempts < 3 && (await reloadBtn.isVisible().catch(() => false))) {
      reloadAttempts += 1;
      await reloadBtn.click();
      await page.waitForTimeout(800);
      continue;
    }

    await Promise.race([
      page.waitForResponse(
        (r) => r.url().includes("/api/community-messenger/bootstrap") && r.request().method() === "GET",
        { timeout: 2000 }
      ),
      rows.first().waitFor({ state: "visible", timeout: 2000 }),
      page.waitForTimeout(200),
    ]).catch(() => {
      /* cache-only home may skip network */
    });
  }

  throw new Error("메신저 채팅 목록 대기 타임아웃 — bootstrap 실패·seed·세션 확인");
}

/** 목록 첫 CM 방 — `div[role=button]` 탭 (Link 아님) */
export async function clickFirstMessengerRoomRow(page: Page): Promise<void> {
  const btn = page.locator('[data-messenger-chat-row="true"] div[role="button"]').first();
  if (await btn.count()) {
    await btn.click();
    return;
  }
  await page.locator('[data-messenger-chat-row="true"]').first().click();
}

export function attachPass0ShellConsoleCollector(
  page: Page,
  sink: Pass0ShellConsolePayload[]
): () => void {
  const handler = (msg: { text: () => string }) => {
    const text = msg.text();
    if (!text.includes("[cm-pre-route-shell]")) return;
    const jsonStart = text.indexOf("{");
    if (jsonStart < 0) return;
    try {
      const parsed = JSON.parse(text.slice(jsonStart)) as Pass0ShellConsolePayload;
      sink.push(parsed);
    } catch {
      /* ignore malformed dev log */
    }
  };
  page.on("console", handler);
  return () => page.off("console", handler);
}

export async function readPass0TimelineSnapshot(
  page: Page,
  opts: { hostChunkToken?: string; hostLoadedBeforeTap: boolean }
): Promise<Pass0TimelineSnapshot> {
  const token = opts.hostChunkToken ?? ROOM_OPENING_HOST_CHUNK;
  return page.evaluate(
    ({ chunkToken, loadedBeforeTap }) => {
      const probe = window.__samarketPass0Probe;
      const resources = performance
        .getEntriesByType("resource")
        .filter((e) => e.name.includes(chunkToken))
        .map((e) => {
          const r = e as PerformanceResourceTiming;
          return {
            startMs: Math.round(r.startTime),
            durationMs: Math.round(r.duration),
            responseEndMs: Math.round(r.responseEnd),
          };
        });
      const roomEl = document.querySelector("[data-cm-room]");
      const livePreRoute = !!document.querySelector("[data-cm-pre-route-shell]");
      const liveRoom = !!roomEl;
      const livePass0 = roomEl?.getAttribute("data-cm-room-pass0") ?? null;
      if (probe && livePreRoute && !probe.domFlags.preRoute) probe.domFlags.preRoute = true;
      if (probe && liveRoom && !probe.domFlags.room) {
        probe.domFlags.room = true;
        probe.domFlags.roomPass0 = livePass0;
      }
      return {
        pathname: location.pathname,
        hostChunkLoadedBeforeTap: loadedBeforeTap,
        hostResourceTimings: resources,
        preRouteShellDomSeen: probe?.domFlags.preRoute ?? livePreRoute,
        roomDomSeen: probe?.domFlags.room ?? liveRoom,
        roomPass0Attr: probe?.domFlags.roomPass0 ?? livePass0,
        events: probe?.events ?? [],
        shellConsolePayloads: [] as Pass0ShellConsolePayload[],
      };
    },
    { chunkToken: token, loadedBeforeTap: opts.hostLoadedBeforeTap }
  );
}

export async function isHostChunkLoaded(page: Page, token = ROOM_OPENING_HOST_CHUNK): Promise<boolean> {
  return page.evaluate(
    (chunkToken) => performance.getEntriesByType("resource").some((e) => e.name.includes(chunkToken)),
    token
  );
}

/** tap 후 room shell 또는 URL 커밋까지 대기 */
export async function waitForRoomEntryAfterTap(page: Page, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const st = await page.evaluate(() => ({
      path: location.pathname,
      room: !!document.querySelector("[data-cm-room]"),
      preRoute: !!document.querySelector("[data-cm-pre-route-shell]"),
    }));
    if (st.path.includes("/community-messenger/rooms/") && (st.room || st.preRoute)) return;
    await page.waitForTimeout(100);
  }
  throw new Error("방 진입 타임아웃 — URL·data-cm-room·pre-route shell 미확인");
}

export function summarizePass0Timeline(snap: Pass0TimelineSnapshot): {
  overlayVisibleMs: number | null;
  preRouteBeforeRoomMs: number | null;
  hostChunkStartAfterTapMs: number | null;
} {
  const overlayFromConsole = snap.shellConsolePayloads
    .map((p) => p.overlay_visible_ms)
    .find((v) => typeof v === "number" && Number.isFinite(v));
  const domPreRoute = snap.events.find((e) => e.kind === "dom_pre_route_shell");
  const domRoom = snap.events.find((e) => e.kind === "dom_room");
  const preRouteBeforeRoomMs =
    domPreRoute && domRoom ? Math.max(0, domRoom.relMs - domPreRoute.relMs) : null;
  const hostAfterTap = snap.hostResourceTimings.find((r) => r.startMs >= 0);
  const tapT0 = snap.events.find((e) => e.kind === "tap_t0");
  const hostChunkStartAfterTapMs =
    hostAfterTap && tapT0 && !snap.hostChunkLoadedBeforeTap ?
      hostAfterTap.startMs
    : snap.hostChunkLoadedBeforeTap ?
      0
    : null;
  return {
    overlayVisibleMs: overlayFromConsole ?? domPreRoute?.relMs ?? null,
    preRouteBeforeRoomMs,
    hostChunkStartAfterTapMs,
  };
}
