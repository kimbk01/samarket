/**
 * BN12-C — measurement-only room entry milestone probe (production 코드 미변경).
 */
import type { Page, Request, Response } from "@playwright/test";
import { ROOM_OPENING_HOST_CHUNK } from "./messenger-pass0-timeline-capture";

export type Pass0MilestoneKey =
  | "tapStart"
  | "routerPushStart"
  | "routerPushDone"
  | "pathRoom"
  | "routePageMount"
  | "routeEntryShell"
  | "pass1StableShell"
  | "preRouteShell"
  | "openingOverlay"
  | "roomShell"
  | "roomPass0InRoute"
  | "bodyDeferred"
  | "phase2Persistent"
  | "messageViewport"
  | "messageListPaint"
  | "composerTextarea"
  | "loadingStatus"
  | "suspenseFallback"
  | "segmentLayout"
  | "segmentShellHost"
  | "segmentLoadingProbe"
  | "layoutInlineShell";

export type Pass0MilestoneMs = Partial<Record<Pass0MilestoneKey, number | null>>;

export type S4DirectColdResourceTimingMs = {
  roomDocumentResponse: number | null;
  roomRscFlight: number | null;
  roomLayoutJs: number | null;
  roomPageJs: number | null;
  roomLoadingJs: number | null;
  segmentShellLayoutChunk: number | null;
  pageClientEntryChunk: number | null;
  deferredEntryChunk: number | null;
  roomClientChunk: number | null;
  roomInnerChunk: number | null;
};

export type S4HtmlFlushBreakdown = {
  documentResponseRelMs: number | null;
  navigationResponseStartMs: number | null;
  navigationResponseEndMs: number | null;
  navigationDomContentLoadedMs: number | null;
  inlineShellInInitialHtml: boolean | null;
  inlineShellInHtmlOutsideScripts: boolean | null;
  segmentLayoutInInitialHtml: boolean | null;
  segmentLayoutInHtmlOutsideScripts: boolean | null;
  segmentShellHostInInitialHtml: boolean | null;
  mainShellRootInInitialHtml: boolean | null;
  probeDomContentLoadedRelMs: number | null;
  probeHtmlHasInlineShellAtDcl: boolean | null;
  probeHtmlHasSegmentLayoutAtDcl: boolean | null;
  probeDomHasInlineShellAtDcl: boolean | null;
  probeDomHasSegmentLayoutAtDcl: boolean | null;
  probeDomHasSegmentShellHostAtDcl: boolean | null;
  probeFirstDomSegmentShellHostMs: number | null;
  probeFirstMainShellRootMs: number | null;
  guestGateSpinnerVisibleAtPathRoom: boolean | null;
  guestGateStatusAtPathRoom: string | null;
  shellHostBeforeMainShellRoot: boolean | null;
};

export type S4DirectColdBreakdown = {
  domMilestonesMs: Partial<Record<Pass0MilestoneKey, number | null>>;
  bn14ProbeMarksRelMs: Record<string, number | null>;
  resourceTimingMs: S4DirectColdResourceTimingMs;
  htmlFlush: S4HtmlFlushBreakdown;
  derived: {
    blankRouteEntryShellMs: number | null;
    pathRoomToSegmentShellHostMs: number | null;
    pathRoomToSegmentLayoutMs: number | null;
    pathRoomToSegmentLoadingProbeMs: number | null;
    segmentShellHostToRouteEntryShellMs: number | null;
    documentToLayoutJsEndMs: number | null;
    layoutJsToPageJsEndMs: number | null;
    pageJsToPageEntryMountMs: number | null;
    pageEntryToDeferredMountMs: number | null;
    pathRoomToPageEntryMountMs: number | null;
    shellHostMissingAfterPathRoomMs: number | null;
  };
  analysis: {
    shellHostVisibleBeforeRouteEntryShell: boolean | null;
    primaryGapHypothesis: string;
    inlineShellInFirstHtml: boolean | null;
    inlineShellInLiveDomAtDcl: boolean | null;
    shellDelayedAfterDocument: boolean | null;
  };
};

export type S4DocumentHtmlCapture = {
  relMs: number;
  inlineShellInInitialHtml: boolean;
  segmentLayoutInInitialHtml: boolean;
  segmentShellHostInInitialHtml: boolean;
  mainShellRootInInitialHtml: boolean;
  inlineShellInHtmlOutsideScripts: boolean;
  segmentLayoutInHtmlOutsideScripts: boolean;
};

export type Pass0NetworkMark = {
  kind: string;
  relMs: number;
  url: string;
  method: string;
  status: number | null;
};

export type Pass0ConsoleMark = {
  relMs: number;
  tag: string;
  payload: Record<string, unknown> | null;
  raw: string;
};

export type Pass0ScenarioMeasurement = {
  scenario: string;
  forwardNav: boolean;
  pathname: string;
  roomId: string | null;
  hostChunkLoadedBeforeTap: boolean;
  hostResourceBeforeTap: Array<{ startMs: number; durationMs: number }>;
  milestonesMs: Pass0MilestoneMs;
  derived: {
    blankDurationMs: number | null;
    routeEntryShellBlankMs: number | null;
    pass1StableShellBlankMs: number | null;
    interactiveDurationMs: number | null;
  };
  liveDom: Record<string, boolean | string | null>;
  networkMarks: Pass0NetworkMark[];
  consoleMarks: Pass0ConsoleMark[];
  runtimePhaseMs: Record<string, number>;
  r2m10SessionPhases: Record<string, number>;
  r2m11dPrefetchSession: Record<string, unknown> | null;
  r2m13RouteChunkWarm: Record<string, unknown> | null;
  /** tap 직전 r2m13 — 시나리오 간 session 오염 여부 판별 */
  r2m13RouteChunkWarmAtTap: Record<string, unknown> | null;
  measurementSessionsReset: boolean;
  resourceTimingMs: {
    roomDocumentResponse: number | null;
    roomRscFlight: number | null;
    roomClientChunk: number | null;
    roomInnerChunk: number | null;
  };
  probeEventKinds: string[];
  s4DirectColdBreakdown: S4DirectColdBreakdown | null;
};

declare global {
  interface Window {
    __samarketPass0MilestoneProbe?: {
      t0: number;
      seen: Set<string>;
      events: Array<{ kind: string; relMs: number; extra?: Record<string, unknown> }>;
    };
  }
}

export async function installPass0MeasurementProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const probe = {
      t0: 0,
      seen: new Set<string>(),
      events: [] as Array<{ kind: string; relMs: number; extra?: Record<string, unknown> }>,
    };
    window.__samarketPass0MilestoneProbe = probe;

    const push = (kind: string, extra?: Record<string, unknown>) => {
      const relMs = probe.t0 > 0 ? Math.round((performance.now() - probe.t0) * 10) / 10 : 0;
      if (probe.seen.has(kind)) return;
      probe.seen.add(kind);
      probe.events.push({ kind, relMs, extra });
    };

    const scan = () => {
      if (document.querySelector("[data-main-shell-root]")) {
        push("dom_main_shell_root");
      }
      if (document.querySelector("[data-cm-room-layout-inline-shell]")) {
        push("dom_layout_inline_shell");
      }
      if (document.querySelector("[data-cm-room-segment-layout]")) {
        push("dom_segment_layout");
      }
      if (document.querySelector("[data-cm-room-segment-shell-host]")) {
        push("dom_segment_shell_host");
      }
      if (document.querySelector("[data-cm-room-route-entry-shell]")) {
        push("dom_route_entry_shell");
      }
      if (document.querySelector("[data-cm-room-pass1-stable-shell]")) {
        push("dom_pass1_stable_shell");
      }
      if (document.querySelector("[data-cm-pre-route-shell]")) {
        push("dom_pre_route_shell");
      }
      if (document.querySelector("[data-cm-room-opening-overlay]")) {
        push("dom_opening_overlay", {
          roomId: document.querySelector("[data-cm-room-opening-overlay]")?.getAttribute("data-opening-room-id"),
        });
      }
      const room = document.querySelector("[data-cm-room]");
      if (room) {
        push("dom_room_shell", { pass0: room.getAttribute("data-cm-room-pass0") });
      }
      if (document.querySelector("[data-cm-room-body-deferred]")) push("dom_body_deferred");
      if (document.querySelector("[data-cm-room-phase2-persistent]")) push("dom_phase2_persistent");
      if (document.querySelector("[data-cm-message-viewport]")) push("dom_message_viewport");
      if (
        document.querySelector(
          '[data-cm-message-viewport] [data-cm-message-row], [data-cm-message-viewport] p, [data-cm-message-viewport] [role="listitem"]'
        )
      ) {
        push("dom_message_list");
      }
      if (document.querySelector("textarea")) push("dom_textarea");
      if (document.querySelector('main [role="status"]')) push("dom_loading_status");
    };

    const onDomContentLoaded = () => {
      const html = document.documentElement.outerHTML;
      push("dom_content_loaded", {
        htmlHasInlineShell: html.includes("data-cm-room-layout-inline-shell"),
        htmlHasSegmentLayout: html.includes("data-cm-room-segment-layout"),
        htmlHasSegmentShellHost: html.includes("data-cm-room-segment-shell-host"),
        htmlHasMainShellRoot: html.includes("data-main-shell-root"),
        domHasInlineShell: !!document.querySelector("[data-cm-room-layout-inline-shell]"),
        domHasSegmentLayout: !!document.querySelector("[data-cm-room-segment-layout]"),
        domHasSegmentShellHost: !!document.querySelector("[data-cm-room-segment-shell-host]"),
        domHasMainShellRoot: !!document.querySelector("[data-main-shell-root]"),
      });
      const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      if (nav) {
        push("nav_timing", {
          responseStartMs: Math.round(nav.responseStart),
          responseEndMs: Math.round(nav.responseEnd),
          domContentLoadedMs: Math.round(nav.domContentLoadedEventEnd),
        });
      }
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", onDomContentLoaded, { once: true });
    } else {
      onDomContentLoaded();
    }

    const mo = new MutationObserver(scan);
    mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
    const tick = () => {
      scan();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

export async function resetPass0MeasurementProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    const probe = window.__samarketPass0MilestoneProbe;
    if (!probe) return;
    probe.t0 = 0;
    probe.seen = new Set();
    probe.events = [];
  });
}

/** BN13 마감 — 시나리오마다 r2m11d/r2m13/r2m10 측정 session 초기화 */
export async function resetPass0MeasurementSessions(page: Page): Promise<void> {
  await page.evaluate(() => {
    try {
      sessionStorage.removeItem("samarket:cm:r2m13:route_chunk_warm");
      sessionStorage.removeItem("samarket:cm:bn14:direct_cold");
      const keys: string[] = [];
      for (let i = 0; i < sessionStorage.length; i += 1) {
        const k = sessionStorage.key(i);
        if (
          k?.startsWith("samarket:cm:r2m11d:session:") ||
          k?.startsWith("samarket:cm:r2m11d:visit:") ||
          k?.startsWith("samarket:cm:r2m11d:breakdown_done:") ||
          k?.startsWith("samarket:cm:r2m10:phases:")
        ) {
          keys.push(k);
        }
      }
      for (const k of keys) sessionStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  });
}

const ROOM_PATH_RE = /\/community-messenger\/rooms\/[^/]+/;
const BN14_DIRECT_COLD_KEY = "samarket:cm:bn14:direct_cold";

async function armBn14DirectColdNavigation(page: Page): Promise<void> {
  await page.evaluate((key) => {
    try {
      sessionStorage.setItem(key, JSON.stringify({ marks: {}, direct_nav: true }));
    } catch {
      /* ignore */
    }
  }, BN14_DIRECT_COLD_KEY);
}

async function waitForRoomPathAfterAct(page: Page, timeoutMs = 60_000): Promise<boolean> {
  try {
    await page.waitForURL(ROOM_PATH_RE, { timeout: timeoutMs, waitUntil: "commit" });
    return true;
  } catch {
    return false;
  }
}

export async function markPass0TapStart(page: Page): Promise<number> {
  const wall = Date.now();
  await page.evaluate(() => {
    const probe = window.__samarketPass0MilestoneProbe;
    if (!probe) return;
    probe.t0 = performance.now();
    probe.seen = new Set(["tapStart"]);
    probe.events = [{ kind: "tapStart", relMs: 0 }];
  });
  return wall;
}

function parseConsolePayload(text: string): { tag: string; payload: Record<string, unknown> | null } | null {
  if (text.includes("[cm-pre-route-shell]")) {
    const i = text.indexOf("{");
    if (i >= 0) {
      try {
        return { tag: "cm-pre-route-shell", payload: JSON.parse(text.slice(i)) as Record<string, unknown> };
      } catch {
        return { tag: "cm-pre-route-shell", payload: null };
      }
    }
    return { tag: "cm-pre-route-shell", payload: null };
  }
  if (text.includes("[R2-M10-ROUTE]")) {
    const i = text.indexOf("{");
    if (i >= 0) {
      try {
        return { tag: "R2-M10-ROUTE", payload: JSON.parse(text.slice(i)) as Record<string, unknown> };
      } catch {
        return { tag: "R2-M10-ROUTE", payload: null };
      }
    }
  }
  return null;
}

function isRoomEntryRequest(url: string, method: string): boolean {
  if (method !== "GET") return false;
  return (
    url.includes("/api/community-messenger/bootstrap") ||
    url.includes("/api/community-messenger/rooms/") ||
    (url.includes("/community-messenger/rooms/") && (url.includes("_rsc=") || !url.includes("/api/")))
  );
}

export function attachPass0MeasurementCollectors(
  page: Page,
  tapWallMs: number,
  sinks: { consoleMarks: Pass0ConsoleMark[]; networkMarks: Pass0NetworkMark[] }
): () => void {
  const onConsole = (msg: { type: () => string; text: () => string }) => {
    const text = msg.text();
    const parsed = parseConsolePayload(text);
    if (!parsed) return;
    sinks.consoleMarks.push({
      relMs: Date.now() - tapWallMs,
      tag: parsed.tag,
      payload: parsed.payload,
      raw: text.slice(0, 500),
    });
  };

  const onRequest = (req: Request) => {
    const url = req.url();
    if (!isRoomEntryRequest(url, req.method())) return;
    sinks.networkMarks.push({
      kind: "request",
      relMs: Date.now() - tapWallMs,
      url: url.split("?")[0] ?? url,
      method: req.method(),
      status: null,
    });
  };

  const onResponse = (res: Response) => {
    const url = res.url();
    const method = res.request().method();
    if (!isRoomEntryRequest(url, method)) return;
    sinks.networkMarks.push({
      kind: "response",
      relMs: Date.now() - tapWallMs,
      url: url.split("?")[0] ?? url,
      method,
      status: res.status(),
    });
  };

  page.on("console", onConsole);
  page.on("request", onRequest);
  page.on("response", onResponse);
  return () => {
    page.off("console", onConsole);
    page.off("request", onRequest);
    page.off("response", onResponse);
  };
}

async function pollMilestones(page: Page, tapWallMs: number, timeoutMs: number): Promise<Pass0MilestoneMs> {
  const marks: Pass0MilestoneMs = { tapStart: 0 };
  const deadline = Date.now() + timeoutMs;
  let lastPath = "";

  while (Date.now() < deadline) {
    const rel = Date.now() - tapWallMs;
    let snap: {
      path: string;
      routeEntryShell: boolean;
      pass1StableShell: boolean;
      preRoute: boolean;
      openingOverlay: boolean;
      roomShell: boolean;
      roomPass0: string | null;
      bodyDeferred: boolean;
      phase2: boolean;
      messageViewport: boolean;
      messageList: boolean;
      textarea: boolean;
      loading: boolean;
      suspense: boolean;
      segmentLayout: boolean;
      segmentShellHost: boolean;
      segmentLoadingProbe: boolean;
      layoutInlineShell: boolean;
    };
    try {
      snap = await page.evaluate(() => {
        const path = location.pathname;
        const room = document.querySelector("[data-cm-room]");
        return {
          path,
          segmentLayout: !!document.querySelector("[data-cm-room-segment-layout]"),
          segmentShellHost: !!document.querySelector("[data-cm-room-segment-shell-host]"),
          layoutInlineShell: !!document.querySelector("[data-cm-room-layout-inline-shell]"),
          segmentLoadingProbe: !!document.querySelector("[data-cm-room-segment-loading-probe]"),
          routeEntryShell: !!document.querySelector("[data-cm-room-route-entry-shell]"),
          pass1StableShell: !!document.querySelector("[data-cm-room-pass1-stable-shell]"),
          preRoute: !!document.querySelector("[data-cm-pre-route-shell]"),
          openingOverlay: !!document.querySelector("[data-cm-room-opening-overlay]"),
          roomShell: !!room,
          roomPass0: room?.getAttribute("data-cm-room-pass0") ?? null,
          bodyDeferred: !!document.querySelector("[data-cm-room-body-deferred]"),
          phase2: !!document.querySelector("[data-cm-room-phase2-persistent]"),
          messageViewport: !!document.querySelector("[data-cm-message-viewport]"),
          messageList: !!document.querySelector(
            '[data-cm-message-viewport] [data-cm-message-row], [data-cm-message-viewport] p, [data-cm-message-viewport] [role="listitem"]'
          ),
          textarea: !!document.querySelector("textarea"),
          loading: !!document.querySelector('main [role="status"]'),
          suspense: !!document.querySelector("[data-cm-room-suspense-fallback], [data-nextjs-suspense-fallback]"),
        };
      });
    } catch {
      await page.waitForTimeout(16);
      continue;
    }

    if (snap.path.includes("/community-messenger/rooms/") && marks.pathRoom == null) {
      marks.pathRoom = rel;
    }
    if (snap.path !== lastPath && snap.path.includes("/community-messenger/rooms/")) {
      lastPath = snap.path;
    }
    const set = (key: Pass0MilestoneKey, cond: boolean) => {
      if (cond && marks[key] == null) marks[key] = rel;
    };
    set("segmentLayout", snap.segmentLayout);
    set("segmentShellHost", snap.segmentShellHost);
    set("layoutInlineShell", snap.layoutInlineShell);
    set("segmentLoadingProbe", snap.segmentLoadingProbe);
    set("routeEntryShell", snap.routeEntryShell);
    set("pass1StableShell", snap.pass1StableShell);
    set("preRouteShell", snap.preRoute);
    set("openingOverlay", snap.openingOverlay);
    set("roomShell", snap.roomShell);
    set(
      "roomPass0InRoute",
      snap.roomPass0 === "" || snap.roomPass0 === "pre-route"
    );
    set("bodyDeferred", snap.bodyDeferred);
    set("phase2Persistent", snap.phase2);
    set("messageViewport", snap.messageViewport);
    set("messageListPaint", snap.messageList);
    set("composerTextarea", snap.textarea);
    set("loadingStatus", snap.loading);
    set("suspenseFallback", snap.suspense);

    if (snap.path.includes("/community-messenger/rooms/") && (snap.roomShell || snap.textarea || snap.preRoute)) {
      if (snap.textarea) break;
    }
    await page.waitForTimeout(16);
  }

  return marks;
}

async function readRuntimePhaseMs(page: Page): Promise<Record<string, number>> {
  return page.evaluate(() => {
    const w = window as unknown as { getAppWidePhaseLastMs?: () => Record<string, number> };
    const phase = w.getAppWidePhaseLastMs?.() ?? {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(phase)) {
      if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    }
    return out;
  });
}

async function readR2M11dPrefetchSession(
  page: Page,
  roomId: string | null
): Promise<Record<string, unknown> | null> {
  if (!roomId) return null;
  return page.evaluate((rid) => {
    try {
      const raw = sessionStorage.getItem(`samarket:cm:r2m11d:session:${rid}`);
      if (!raw) return null;
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return null;
    }
  }, roomId);
}

async function readR2M13RouteChunkWarm(page: Page): Promise<Record<string, unknown> | null> {
  return page.evaluate(() => {
    try {
      const raw = sessionStorage.getItem("samarket:cm:r2m13:route_chunk_warm");
      if (!raw) return null;
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return null;
    }
  });
}

function relMsOrNull(base: number | null | undefined, at: number | null | undefined): number | null {
  if (base == null || at == null || !Number.isFinite(base) || !Number.isFinite(at)) return null;
  return Math.max(0, Math.round(at - base));
}

async function readBn14DirectColdProbeMarks(
  page: Page,
  tapPerfMs: number
): Promise<{ marksRelMs: Record<string, number | null>; directNav: boolean }> {
  return page.evaluate(
    ({ key, tapPerf }) => {
      try {
        const raw = sessionStorage.getItem(key);
        if (!raw) return { marksRelMs: {}, directNav: false };
        const session = JSON.parse(raw) as {
          marks?: Record<string, number>;
          direct_nav?: boolean;
        };
        const marksRelMs: Record<string, number | null> = {};
        for (const [k, v] of Object.entries(session.marks ?? {})) {
          marksRelMs[k] =
            typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.round(v - tapPerf)) : null;
        }
        return { marksRelMs, directNav: Boolean(session.direct_nav) };
      } catch {
        return { marksRelMs: {}, directNav: false };
      }
    },
    { key: BN14_DIRECT_COLD_KEY, tapPerf: tapPerfMs }
  );
}

async function readTapPerfMs(page: Page): Promise<number> {
  return page.evaluate(() => window.__samarketPass0MilestoneProbe?.t0 ?? performance.now());
}

async function readS4DirectColdResourceTimingMs(
  page: Page,
  roomId: string | null
): Promise<S4DirectColdResourceTimingMs> {
  const empty: S4DirectColdResourceTimingMs = {
    roomDocumentResponse: null,
    roomRscFlight: null,
    roomLayoutJs: null,
    roomPageJs: null,
    roomLoadingJs: null,
    segmentShellLayoutChunk: null,
    pageClientEntryChunk: null,
    deferredEntryChunk: null,
    roomClientChunk: null,
    roomInnerChunk: null,
  };
  if (!roomId) return empty;
  return page.evaluate((rid) => {
    const out: S4DirectColdResourceTimingMs = {
      roomDocumentResponse: null,
      roomRscFlight: null,
      roomLayoutJs: null,
      roomPageJs: null,
      roomLoadingJs: null,
      segmentShellLayoutChunk: null,
      pageClientEntryChunk: null,
      deferredEntryChunk: null,
      roomClientChunk: null,
      roomInnerChunk: null,
    };
    const enc = encodeURIComponent(rid);
    const pathNeedle = `/community-messenger/rooms/${enc}`;
    const resources = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
    const relEnd = (e: PerformanceResourceTiming) =>
      Math.round(e.responseEnd > 0 ? e.responseEnd : e.startTime + e.duration);

    for (const e of resources) {
      const name = e.name;
      const end = relEnd(e);
      if (name.includes(pathNeedle) && name.includes("_rsc=")) {
        if (out.roomRscFlight == null || end < out.roomRscFlight) out.roomRscFlight = end;
      } else if (name.includes(pathNeedle) && !name.includes("/api/") && !name.includes("_next/")) {
        if (out.roomDocumentResponse == null || end < out.roomDocumentResponse) out.roomDocumentResponse = end;
      }
      if (name.includes("rooms/%5BroomId%5D/layout.js") || name.includes("rooms/[roomId]/layout")) {
        if (out.roomLayoutJs == null || end < out.roomLayoutJs) out.roomLayoutJs = end;
      }
      if (name.includes("rooms/%5BroomId%5D/page.js") || name.includes("rooms/[roomId]/page")) {
        if (out.roomPageJs == null || end < out.roomPageJs) out.roomPageJs = end;
      }
      if (name.includes("rooms/%5BroomId%5D/loading.js") || name.includes("rooms/%5BroomId%5D/loading")) {
        if (out.roomLoadingJs == null || end < out.roomLoadingJs) out.roomLoadingJs = end;
      }
      if (
        name.includes("CommunityMessengerRoomLayoutShellClientBridge") ||
        name.includes("CommunityMessengerRoomSegmentShellLayout")
      ) {
        if (out.segmentShellLayoutChunk == null || end < out.segmentShellLayoutChunk) {
          out.segmentShellLayoutChunk = end;
        }
      }
      if (name.includes("CommunityMessengerRoomPageClientEntry") && !name.includes("Deferred")) {
        if (out.pageClientEntryChunk == null || end < out.pageClientEntryChunk) {
          out.pageClientEntryChunk = end;
        }
      }
      if (name.includes("CommunityMessengerRoomPageClientEntryDeferred")) {
        if (out.deferredEntryChunk == null || end < out.deferredEntryChunk) out.deferredEntryChunk = end;
      }
      if (name.includes("CommunityMessengerRoomClient") && !name.includes("Inner")) {
        if (out.roomClientChunk == null || end < out.roomClientChunk) out.roomClientChunk = end;
      }
      if (name.includes("CommunityMessengerRoomClientInner")) {
        if (out.roomInnerChunk == null || end < out.roomInnerChunk) out.roomInnerChunk = end;
      }
    }
    return out;
  }, roomId);
}

function probeEventRelMs(
  events: Array<{ kind: string; relMs: number; extra?: Record<string, unknown> }>,
  kind: string
): number | null {
  const hit = events.find((e) => e.kind === kind);
  return hit != null && Number.isFinite(hit.relMs) ? hit.relMs : null;
}

function probeEventExtra(
  events: Array<{ kind: string; relMs: number; extra?: Record<string, unknown> }>,
  kind: string
): Record<string, unknown> | null {
  const hit = events.find((e) => e.kind === kind);
  return hit?.extra ?? null;
}

function buildS4HtmlFlushBreakdown(
  milestonesMs: Pass0MilestoneMs,
  documentCapture: S4DocumentHtmlCapture | null,
  probeEvents: Array<{ kind: string; relMs: number; extra?: Record<string, unknown> }>,
  tapWallMs: number
): S4HtmlFlushBreakdown {
  const dclExtra = probeEventExtra(probeEvents, "dom_content_loaded");
  const navExtra = probeEventExtra(probeEvents, "nav_timing");
  const pathRoom = milestonesMs.pathRoom ?? null;
  const firstMainShellRoot = probeEventRelMs(probeEvents, "dom_main_shell_root");
  const firstSegmentShellHost = probeEventRelMs(probeEvents, "dom_segment_shell_host");

  let guestGateSpinnerVisibleAtPathRoom: boolean | null = null;
  let guestGateStatusAtPathRoom: string | null = null;
  if (pathRoom != null) {
    // pathRoom 시점은 poll 기준 — probe 이벤트와 별도로 최종 스냅샷은 measurePass0Scenario 후반에서 보강 가능
    guestGateSpinnerVisibleAtPathRoom = null;
    guestGateStatusAtPathRoom = null;
  }

  return {
    documentResponseRelMs: documentCapture?.relMs ?? null,
    navigationResponseStartMs:
      typeof navExtra?.responseStartMs === "number" ? (navExtra.responseStartMs as number) : null,
    navigationResponseEndMs:
      typeof navExtra?.responseEndMs === "number" ? (navExtra.responseEndMs as number) : null,
    navigationDomContentLoadedMs:
      typeof navExtra?.domContentLoadedMs === "number" ? (navExtra.domContentLoadedMs as number) : null,
    inlineShellInInitialHtml: documentCapture?.inlineShellInInitialHtml ?? null,
    inlineShellInHtmlOutsideScripts: documentCapture?.inlineShellInHtmlOutsideScripts ?? null,
    segmentLayoutInInitialHtml: documentCapture?.segmentLayoutInInitialHtml ?? null,
    segmentLayoutInHtmlOutsideScripts: documentCapture?.segmentLayoutInHtmlOutsideScripts ?? null,
    segmentShellHostInInitialHtml: documentCapture?.segmentShellHostInInitialHtml ?? null,
    mainShellRootInInitialHtml: documentCapture?.mainShellRootInInitialHtml ?? null,
    probeDomContentLoadedRelMs: probeEventRelMs(probeEvents, "dom_content_loaded"),
    probeHtmlHasInlineShellAtDcl:
      typeof dclExtra?.htmlHasInlineShell === "boolean" ? (dclExtra.htmlHasInlineShell as boolean) : null,
    probeHtmlHasSegmentLayoutAtDcl:
      typeof dclExtra?.htmlHasSegmentLayout === "boolean" ? (dclExtra.htmlHasSegmentLayout as boolean) : null,
    probeDomHasInlineShellAtDcl:
      typeof dclExtra?.domHasInlineShell === "boolean" ? (dclExtra.domHasInlineShell as boolean) : null,
    probeDomHasSegmentLayoutAtDcl:
      typeof dclExtra?.domHasSegmentLayout === "boolean" ? (dclExtra.domHasSegmentLayout as boolean) : null,
    probeDomHasSegmentShellHostAtDcl:
      typeof dclExtra?.domHasSegmentShellHost === "boolean" ? (dclExtra.domHasSegmentShellHost as boolean) : null,
    probeFirstDomSegmentShellHostMs: firstSegmentShellHost,
    probeFirstMainShellRootMs: firstMainShellRoot,
    guestGateSpinnerVisibleAtPathRoom,
    guestGateStatusAtPathRoom,
    shellHostBeforeMainShellRoot:
      firstSegmentShellHost != null && firstMainShellRoot != null
        ? firstSegmentShellHost <= firstMainShellRoot
        : null,
  };
}

function buildS4DirectColdBreakdown(
  milestonesMs: Pass0MilestoneMs,
  bn14MarksRelMs: Record<string, number | null>,
  resourceTimingMs: S4DirectColdResourceTimingMs,
  htmlFlush: S4HtmlFlushBreakdown
): S4DirectColdBreakdown {
  const pathRoom = milestonesMs.pathRoom ?? null;
  const routeEntryShell = milestonesMs.routeEntryShell ?? null;
  const segmentShellHost = milestonesMs.segmentShellHost ?? null;
  const segmentLayout = milestonesMs.segmentLayout ?? null;
  const segmentLoadingProbe = milestonesMs.segmentLoadingProbe ?? null;

  const blankRouteEntryShellMs =
    pathRoom != null && routeEntryShell != null ? Math.max(0, routeEntryShell - pathRoom) : null;

  const shellHostVisibleBeforeRouteEntryShell =
    segmentShellHost != null && routeEntryShell != null ? segmentShellHost <= routeEntryShell : null;

  let primaryGapHypothesis = "unknown";
  if (blankRouteEntryShellMs != null) {
    if (segmentShellHost == null || (pathRoom != null && segmentShellHost > pathRoom + 200)) {
      primaryGapHypothesis =
        resourceTimingMs.segmentShellLayoutChunk != null
          ? "pathRoom 후 segment layout/shell chunk cold download+parse — shell host DOM 지연"
          : "pathRoom 후 RSC slot·상위 client provider hydrate 지연 — server inline shell HTML 적용 시점 지연";
    } else if (
      bn14MarksRelMs.page_client_entry_mount != null &&
      routeEntryShell != null &&
      bn14MarksRelMs.page_client_entry_mount > (segmentShellHost ?? 0)
    ) {
      primaryGapHypothesis = "layout shell 후 page client entry hydrate 지연";
    } else if (
      bn14MarksRelMs.deferred_mount != null &&
      bn14MarksRelMs.deferred_mount > (bn14MarksRelMs.page_client_entry_mount ?? 0)
    ) {
      primaryGapHypothesis = "PageClientEntry → Deferred chunk import/eval 지연";
    } else {
      primaryGapHypothesis = "layout shell paint → routeEntryShell 마일스톤 정합 구간";
    }
  }

  const inlineShellInFirstHtml =
    htmlFlush.inlineShellInInitialHtml ?? htmlFlush.probeHtmlHasInlineShellAtDcl ?? null;
  const inlineShellInLiveDomAtDcl = htmlFlush.probeDomHasInlineShellAtDcl ?? null;
  const shellDelayedAfterDocument =
    inlineShellInLiveDomAtDcl === false &&
    segmentShellHost != null &&
    htmlFlush.documentResponseRelMs != null
      ? segmentShellHost > htmlFlush.documentResponseRelMs + 100
      : inlineShellInLiveDomAtDcl === true
        ? false
        : null;

  return {
    domMilestonesMs: {
      pathRoom,
      segmentLoadingProbe,
      layoutInlineShell: milestonesMs.layoutInlineShell ?? null,
      segmentLayout,
      segmentShellHost,
      routeEntryShell,
      pass1StableShell: milestonesMs.pass1StableShell ?? null,
      routePageMount: milestonesMs.routePageMount ?? null,
    },
    bn14ProbeMarksRelMs: bn14MarksRelMs,
    resourceTimingMs,
    htmlFlush,
    derived: {
      blankRouteEntryShellMs,
      pathRoomToSegmentShellHostMs: relMsOrNull(pathRoom, segmentShellHost),
      pathRoomToSegmentLayoutMs: relMsOrNull(pathRoom, segmentLayout),
      pathRoomToSegmentLoadingProbeMs: relMsOrNull(pathRoom, segmentLoadingProbe),
      segmentShellHostToRouteEntryShellMs: relMsOrNull(segmentShellHost, routeEntryShell),
      documentToLayoutJsEndMs: relMsOrNull(resourceTimingMs.roomDocumentResponse, resourceTimingMs.roomLayoutJs),
      layoutJsToPageJsEndMs: relMsOrNull(resourceTimingMs.roomLayoutJs, resourceTimingMs.roomPageJs),
      pageJsToPageEntryMountMs: relMsOrNull(
        resourceTimingMs.roomPageJs,
        bn14MarksRelMs.page_client_entry_mount
      ),
      pageEntryToDeferredMountMs: relMsOrNull(
        bn14MarksRelMs.page_client_entry_mount,
        bn14MarksRelMs.deferred_mount
      ),
      pathRoomToPageEntryMountMs: relMsOrNull(pathRoom, bn14MarksRelMs.page_client_entry_mount),
      shellHostMissingAfterPathRoomMs:
        pathRoom != null && segmentShellHost == null ? blankRouteEntryShellMs : null,
    },
    analysis: {
      shellHostVisibleBeforeRouteEntryShell,
      primaryGapHypothesis,
      inlineShellInFirstHtml,
      inlineShellInLiveDomAtDcl,
      shellDelayedAfterDocument,
    },
  };
}

export function attachS4DocumentHtmlCapture(
  page: Page,
  tapWallMs: number,
  roomId: string
): { getCapture: () => S4DocumentHtmlCapture | null; detach: () => void } {
  let capture: S4DocumentHtmlCapture | null = null;
  const enc = encodeURIComponent(roomId);
  const pathNeedle = `/community-messenger/rooms/${enc}`;

  const onResponse = async (res: Response) => {
    if (capture) return;
    const url = res.url().split("?")[0] ?? "";
    if (res.request().method() !== "GET") return;
    if (!url.includes(pathNeedle)) return;
    const contentType = res.headers()["content-type"] ?? "";
    if (!contentType.includes("text/html")) return;
    try {
      const body = await res.text();
      const htmlOutsideScripts = body.replace(/<script[\s\S]*?<\/script>/gi, "");
      capture = {
        relMs: Date.now() - tapWallMs,
        inlineShellInInitialHtml: body.includes("data-cm-room-layout-inline-shell"),
        segmentLayoutInInitialHtml: body.includes("data-cm-room-segment-layout"),
        segmentShellHostInInitialHtml: body.includes("data-cm-room-segment-shell-host"),
        mainShellRootInInitialHtml: body.includes("data-main-shell-root"),
        inlineShellInHtmlOutsideScripts: htmlOutsideScripts.includes("data-cm-room-layout-inline-shell"),
        segmentLayoutInHtmlOutsideScripts: htmlOutsideScripts.includes("data-cm-room-segment-layout"),
      };
    } catch {
      /* ignore */
    }
  };

  page.on("response", onResponse);
  return {
    getCapture: () => capture,
    detach: () => {
      page.off("response", onResponse);
    },
  };
}

async function readGuestGateStateAtPathRoom(page: Page): Promise<{
  guestGateSpinnerVisibleAtPathRoom: boolean | null;
  guestGateStatusAtPathRoom: string | null;
}> {
  return page.evaluate(() => {
    const debug = document.querySelector("[data-cm-guest-gate-debug]");
    const spinner = document.querySelector("[data-cm-guest-gate-spinner]");
    return {
      guestGateSpinnerVisibleAtPathRoom: !!spinner,
      guestGateStatusAtPathRoom: debug?.getAttribute("data-cm-guest-gate-status") ?? null,
    };
  });
}

async function readRoomResourceTimingMs(
  page: Page,
  roomId: string | null,
  tapWallMs: number
): Promise<Pass0ScenarioMeasurement["resourceTimingMs"]> {
  const empty = {
    roomDocumentResponse: null,
    roomRscFlight: null,
    roomClientChunk: null,
    roomInnerChunk: null,
  };
  if (!roomId) return empty;
  return page.evaluate(
    ({ rid, wall0 }) => {
      const out = {
        roomDocumentResponse: null as number | null,
        roomRscFlight: null as number | null,
        roomClientChunk: null as number | null,
        roomInnerChunk: null as number | null,
      };
      const enc = encodeURIComponent(rid);
      const pathNeedle = `/community-messenger/rooms/${enc}`;
      const resources = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
      for (const e of resources) {
        const relStart = Math.round(e.startTime);
        const relEnd = Math.round(e.responseEnd > 0 ? e.responseEnd : e.startTime + e.duration);
        if (e.name.includes(pathNeedle) && e.name.includes("_rsc=")) {
          if (out.roomRscFlight == null || relEnd < out.roomRscFlight) out.roomRscFlight = relEnd;
        } else if (e.name.includes(pathNeedle) && !e.name.includes("/api/")) {
          if (out.roomDocumentResponse == null || relEnd < out.roomDocumentResponse) {
            out.roomDocumentResponse = relEnd;
          }
        }
        if (e.name.includes("CommunityMessengerRoomClient")) {
          if (out.roomClientChunk == null || relEnd < out.roomClientChunk) out.roomClientChunk = relEnd;
        }
        if (e.name.includes("CommunityMessengerRoomClientInner")) {
          if (out.roomInnerChunk == null || relEnd < out.roomInnerChunk) out.roomInnerChunk = relEnd;
        }
      }
      void wall0;
      return out;
    },
    { rid: roomId, wall0: tapWallMs }
  );
}

async function readR2M10Phases(page: Page, roomId: string | null): Promise<Record<string, number>> {
  if (!roomId) return {};
  return page.evaluate((rid) => {
    try {
      const raw = sessionStorage.getItem(`samarket:cm:r2m10:phases:${rid}`);
      if (!raw) return {};
      const phases = JSON.parse(raw) as Record<string, number>;
      const t0 = phases.list_tap_t0;
      if (typeof t0 !== "number" || !Number.isFinite(t0)) return {};
      const sinceTap = (phase: string): number | undefined => {
        const at = phases[phase];
        if (typeof at !== "number" || !Number.isFinite(at)) return undefined;
        return Math.max(0, Math.round(at - t0));
      };
      const phaseMs = {
        router_push_start_ms: sinceTap("router_push_start"),
        router_push_done_ms: sinceTap("router_push_done"),
        route_change_start_ms: sinceTap("route_change_start"),
        route_page_mount_ms: sinceTap("route_page_mount"),
        room_page_chunk_loaded_ms: sinceTap("room_page_chunk_loaded"),
      };
      const out: Record<string, number> = {};
      for (const [k, v] of Object.entries(phaseMs)) {
        if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
      }
      return out;
    } catch {
      return {};
    }
  }, roomId);
}

function roomIdFromPath(pathname: string): string | null {
  const m = pathname.match(/\/community-messenger\/rooms\/([^/?#]+)/);
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

function mergeRuntimeRscIntoMilestones(
  marks: Pass0MilestoneMs,
  runtimePhaseMs: Record<string, number>
): void {
  const setIfNull = (key: Pass0MilestoneKey, v: number | undefined) => {
    if (v != null && Number.isFinite(v) && marks[key] == null) marks[key] = v;
  };
  setIfNull("routePageMount", runtimePhaseMs.messenger_room_entry_page_mount_start_ms);
}

function mergeR2M10IntoMilestones(
  marks: Pass0MilestoneMs,
  phases: Record<string, number>,
  runtimePhaseMs: Record<string, number>
): void {
  const setIfNull = (key: Pass0MilestoneKey, v: number | undefined) => {
    if (v != null && Number.isFinite(v) && marks[key] == null) marks[key] = v;
  };
  setIfNull("routerPushStart", phases.router_push_start_ms ?? runtimePhaseMs.r2m10_router_push_start_ms);
  setIfNull("routerPushDone", phases.router_push_done_ms ?? runtimePhaseMs.r2m10_router_push_done_ms);
  setIfNull("pathRoom", phases.route_change_start_ms ?? runtimePhaseMs.r2m10_route_change_start_ms);
  setIfNull("routePageMount", phases.route_page_mount_ms ?? runtimePhaseMs.r2m10_route_page_mount_ms);
}

function mergeConsoleIntoMilestones(marks: Pass0MilestoneMs, consoles: Pass0ConsoleMark[]): void {
  for (const c of consoles) {
    if (c.tag === "R2-M10-ROUTE" && c.payload) {
      const p = c.payload;
      if (marks.routerPushStart == null && typeof p.tap_to_push_ms === "number") {
        marks.routerPushStart = p.tap_to_push_ms as number;
      }
      if (marks.routerPushDone == null && typeof p.push_to_route_change_ms === "number") {
        const pushStart = (p.tap_to_push_ms as number) ?? 0;
        marks.routerPushDone = pushStart + (p.push_to_route_change_ms as number);
      }
      if (marks.pathRoom == null && typeof p.push_to_route_change_ms === "number") {
        const pushStart = (p.tap_to_push_ms as number) ?? 0;
        marks.pathRoom = pushStart + (p.push_to_route_change_ms as number);
      }
      if (marks.routePageMount == null && typeof p.route_change_to_page_mount_ms === "number") {
        const base = marks.pathRoom ?? 0;
        marks.routePageMount = base + (p.route_change_to_page_mount_ms as number);
      }
    }
    if (c.tag === "cm-pre-route-shell" && c.payload && marks.preRouteShell == null) {
      const ov = c.payload.overlay_visible_ms;
      if (typeof ov === "number") marks.preRouteShell = ov;
    }
  }
}

export async function measurePass0Scenario(
  page: Page,
  scenario: string,
  forwardNav: boolean,
  setup: () => Promise<void>,
  act: () => Promise<void>
): Promise<Pass0ScenarioMeasurement> {
  const consoleMarks: Pass0ConsoleMark[] = [];
  const networkMarks: Pass0NetworkMark[] = [];

  await resetPass0MeasurementProbe(page);
  await resetPass0MeasurementSessions(page);
  await setup();

  const hostBefore = await page.evaluate((token) => ({
    loaded: performance.getEntriesByType("resource").some((e) => e.name.includes(token)),
    res: performance
      .getEntriesByType("resource")
      .filter((e) => e.name.includes(token))
      .map((e) => ({ startMs: Math.round(e.startTime), durationMs: Math.round(e.duration) })),
  }), ROOM_OPENING_HOST_CHUNK);

  const tapWallMs = await markPass0TapStart(page);
  const tapPerfMs = await readTapPerfMs(page);
  const r2m13RouteChunkWarmAtTap = await readR2M13RouteChunkWarm(page);
  const detach = attachPass0MeasurementCollectors(page, tapWallMs, { consoleMarks, networkMarks });

  const envRoom = process.env.E2E_SNAPSHOT_DIAG_ROOM_ID?.trim() ?? null;
  let s4DocCaptureDetach: (() => void) | null = null;
  let getS4DocumentCapture: (() => S4DocumentHtmlCapture | null) | null = null;
  if (scenario.includes("S4_") && envRoom) {
    await armBn14DirectColdNavigation(page);
    const cap = attachS4DocumentHtmlCapture(page, tapWallMs, envRoom);
    getS4DocumentCapture = cap.getCapture;
    s4DocCaptureDetach = cap.detach;
  }

  await act();
  await waitForRoomPathAfterAct(page);

  const milestonesMs = await pollMilestones(page, tapWallMs, 45_000);
  await page.waitForTimeout(1000);
  mergeConsoleIntoMilestones(milestonesMs, consoleMarks);

  const pathname = page.url().replace(/^https?:\/\/[^/]+/, "").split("?")[0] ?? "";
  const roomId = roomIdFromPath(pathname);

  const runtimePhaseMs = await readRuntimePhaseMs(page);
  const r2m10SessionPhases = await readR2M10Phases(page, roomId);
  const r2m11dPrefetchSession = await readR2M11dPrefetchSession(page, roomId);
  const r2m13RouteChunkWarm = await readR2M13RouteChunkWarm(page);
  const resourceTimingMs = await readRoomResourceTimingMs(page, roomId, tapWallMs);
  const bn14Probe = await readBn14DirectColdProbeMarks(page, tapPerfMs);
  const s4ResourceTimingMs =
    scenario.includes("S4_") && roomId ? await readS4DirectColdResourceTimingMs(page, roomId) : null;
  s4DocCaptureDetach?.();
  const probeEvents = await page.evaluate(() => window.__samarketPass0MilestoneProbe?.events ?? []);
  const guestGateAtEnd =
    scenario.includes("S4_") ? await readGuestGateStateAtPathRoom(page) : null;
  const s4HtmlFlush =
    scenario.includes("S4_") && bn14Probe.directNav
      ? buildS4HtmlFlushBreakdown(
          milestonesMs,
          getS4DocumentCapture?.() ?? null,
          probeEvents,
          tapWallMs
        )
      : null;
  if (s4HtmlFlush && guestGateAtEnd) {
    s4HtmlFlush.guestGateSpinnerVisibleAtPathRoom = guestGateAtEnd.guestGateSpinnerVisibleAtPathRoom;
    s4HtmlFlush.guestGateStatusAtPathRoom = guestGateAtEnd.guestGateStatusAtPathRoom;
  }
  const s4DirectColdBreakdown =
    scenario.includes("S4_") && bn14Probe.directNav && s4HtmlFlush
      ? buildS4DirectColdBreakdown(
          milestonesMs,
          bn14Probe.marksRelMs,
          s4ResourceTimingMs ?? {
            roomDocumentResponse: resourceTimingMs.roomDocumentResponse,
            roomRscFlight: resourceTimingMs.roomRscFlight,
            roomLayoutJs: null,
            roomPageJs: null,
            roomLoadingJs: null,
            segmentShellLayoutChunk: null,
            pageClientEntryChunk: null,
            deferredEntryChunk: null,
            roomClientChunk: resourceTimingMs.roomClientChunk,
            roomInnerChunk: resourceTimingMs.roomInnerChunk,
          },
          s4HtmlFlush
        )
      : null;
  mergeR2M10IntoMilestones(milestonesMs, r2m10SessionPhases, runtimePhaseMs);
  mergeRuntimeRscIntoMilestones(milestonesMs, runtimePhaseMs);
  const liveDom = await page.evaluate(() => {
    const room = document.querySelector("[data-cm-room]");
    return {
      preRouteShell: !!document.querySelector("[data-cm-pre-route-shell]"),
      openingOverlay: !!document.querySelector("[data-cm-room-opening-overlay]"),
      roomShell: !!room,
      roomPass0: room?.getAttribute("data-cm-room-pass0") ?? null,
      bodyDeferred: !!document.querySelector("[data-cm-room-body-deferred]"),
      messageViewport: !!document.querySelector("[data-cm-message-viewport]"),
      textarea: !!document.querySelector("textarea"),
      loadingStatus: !!document.querySelector('main [role="status"]'),
    };
  });

  detach();

  const blankDurationMs =
    milestonesMs.pathRoom != null && milestonesMs.roomShell != null ?
      Math.max(0, milestonesMs.roomShell - milestonesMs.pathRoom)
    : null;
  const routeEntryShellBlankMs =
    milestonesMs.pathRoom != null && milestonesMs.routeEntryShell != null ?
      Math.max(0, milestonesMs.routeEntryShell - milestonesMs.pathRoom)
    : null;
  const pass1StableShellBlankMs =
    milestonesMs.pathRoom != null && milestonesMs.pass1StableShell != null ?
      Math.max(0, milestonesMs.pass1StableShell - milestonesMs.pathRoom)
    : null;
  const interactiveDurationMs =
    milestonesMs.pathRoom != null && milestonesMs.composerTextarea != null ?
      Math.max(0, milestonesMs.composerTextarea - milestonesMs.pathRoom)
    : null;

  return {
    scenario,
    forwardNav,
    pathname,
    roomId,
    hostChunkLoadedBeforeTap: hostBefore.loaded,
    hostResourceBeforeTap: hostBefore.res,
    milestonesMs,
    derived: {
      blankDurationMs,
      routeEntryShellBlankMs,
      pass1StableShellBlankMs,
      interactiveDurationMs,
    },
    liveDom,
    networkMarks,
    consoleMarks,
    runtimePhaseMs,
    r2m10SessionPhases,
    r2m11dPrefetchSession,
    r2m13RouteChunkWarm,
    r2m13RouteChunkWarmAtTap,
    measurementSessionsReset: true,
    resourceTimingMs,
    probeEventKinds: probeEvents.map((e) => e.kind),
    s4DirectColdBreakdown,
  };
}
