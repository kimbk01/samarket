/**
 * dev compile wall vs 핸들러 내부(DB/API) 시간 분리 — `[perf-measurement-context]`.
 * Production: no-op.
 */

export type PerfRouteClassification = {
  is_messenger_route: boolean;
  is_home_sync_route: boolean;
  is_room_bootstrap_route: boolean;
};

export function classifyPerfRoute(route: string): PerfRouteClassification {
  const path = String(route ?? "").split("?")[0]?.trim() ?? "";
  const is_home_sync_route = path === "/api/community-messenger/home-sync";
  const is_room_bootstrap_route = /\/api\/community-messenger\/rooms\/[^/]+\/bootstrap\/?$/.test(path);
  const is_messenger_route =
    path.startsWith("/api/community-messenger/") || is_home_sync_route || is_room_bootstrap_route;
  return { is_messenger_route, is_home_sync_route, is_room_bootstrap_route };
}

export type PerfMeasurementContextInput = {
  route: string;
  /** Route handler 내부 벽시계(webpack compile 제외) */
  server_handler_ms: number;
  dev_compile_ms?: number;
  route_render_ms?: number;
  /** Next dev 로그 wall(compile+render) — 알 때만 */
  wall_ms?: number;
  extras?: Record<string, unknown>;
};

function nonMessengerBottleneckHint(route: string): string | null {
  const path = route.split("?")[0] ?? route;
  if (path === "/api/me/store-owner-hub-badge") {
    return "non_messenger: hub-badge badge_query_ms — see dev-api-perf (not CM bootstrap)";
  }
  if (path === "/api/me/profile") {
    return "non_messenger: profile pipeline / cache miss — not CM";
  }
  if (path.startsWith("/api/philife/neighborhood-feed")) {
    return "non_messenger: philife feed query — not CM";
  }
  if (path.startsWith("/api/stores/home-feed")) {
    return "non_messenger: stores home-feed — not CM";
  }
  if (path.startsWith("/api/ads/active")) {
    return "non_messenger: ads route — dev first-hit compile often dominates wall";
  }
  return null;
}

let messengerMeasurementGuideLogged = false;

/** 메신저 재측정 절차 — 세션당 1회(터미널·브라우저 로그 안내) */
export function logMessengerPerfMeasurementGuideOnce(): void {
  if (process.env.NODE_ENV !== "development" || messengerMeasurementGuideLogged) return;
  messengerMeasurementGuideLogged = true;
  // eslint-disable-next-line no-console -- measurement procedure (dev only)
  console.info("[messenger-perf-measurement-guide]", {
    terminal_steps: [
      "A. GET /community-messenger (home-sync)",
      "B. GET /community-messenger/rooms/{roomId} (bootstrap)",
      "C. Terminal: [cm-bootstrap-tier], [home-sync-perf], [home-sync-critical], GET .../bootstrap, GET .../home-sync",
    ],
    browser_console_steps: [
      "[cm-bootstrap-trigger]",
      "[cm-bootstrap-schedule-gap]",
      "bootstrap_fetch:breakdown A_client_fetch_to_headers_ms",
      "[cm-longtask]",
      "[cm-react-commit]",
    ],
    judgment_order: [
      "1st: same page second visit in dev (ignore first-hit compile in wall)",
      "2nd: npm run build && npm start",
      "3rd: Vercel preview/prod",
    ],
    do_not_judge_cm_from: [
      "/api/me/profile",
      "/api/me/store-owner-hub-badge",
      "/api/philife/neighborhood-feed",
      "/api/stores/home-feed",
      "/mypage APIs",
    ],
    non_messenger_priority_if_app_wide: [
      "store-owner-hub-badge badge_query",
      "profile cache miss pipeline",
      "philife neighborhood-feed",
      "stores home-feed render",
    ],
  });
}

export function logPerfMeasurementContext(input: PerfMeasurementContextInput): void {
  if (process.env.NODE_ENV !== "development") return;

  const { is_messenger_route, is_home_sync_route, is_room_bootstrap_route } = classifyPerfRoute(input.route);
  const serverHandlerMs = Math.round(input.server_handler_ms);
  const compileMs = Math.round(input.dev_compile_ms ?? 0);
  const renderMs = Math.round(input.route_render_ms ?? serverHandlerMs);
  const wallMs = Math.round(input.wall_ms ?? serverHandlerMs + compileMs);
  const realApiMs = serverHandlerMs;
  const is_dev_compile_noise =
    compileMs >= 500 || (wallMs > 0 && realApiMs > 0 && wallMs >= realApiMs + 400);

  const hint = !is_messenger_route ? nonMessengerBottleneckHint(input.route) : null;

  // eslint-disable-next-line no-console -- perf measurement split (dev only)
  console.log("[perf-measurement-context]", {
    route: input.route,
    is_messenger_route,
    is_home_sync_route,
    is_room_bootstrap_route,
    is_dev_compile_noise,
    compile_ms: compileMs,
    render_ms: renderMs,
    wall_ms: wallMs,
    measurement_valid_for_messenger: is_messenger_route,
    dev_compile_ms: compileMs,
    route_render_ms: renderMs,
    server_handler_ms: serverHandlerMs,
    real_api_ms_without_compile: realApiMs,
    messenger_perf_judgment_note: is_messenger_route
      ? "valid for CM goals — use server_handler_ms / 2nd visit / prod"
      : hint ?? "not a messenger route — do not judge CM bootstrap/home-sync from this log",
    ...(input.extras ?? {}),
  });

  if (is_messenger_route) {
    logMessengerPerfMeasurementGuideOnce();
  }
}

/** Next dev `GET ... (compile: Xms, render: Yms)` 파싱용 — 핸들러 밖에서 호출 가능 */
export function parseNextDevRouteWallFromLogLine(line: string): {
  wall_ms: number;
  dev_compile_ms: number;
  route_render_ms: number;
} | null {
  const wall = /in (\d+)ms/.exec(line);
  const compile = /compile:\s*([\d.]+)(m?)s/.exec(line);
  const render = /render:\s*([\d.]+)(m?)s/.exec(line);
  if (!wall) return null;
  const toMs = (n: number, unit: string | undefined) => (unit === "m" ? Math.round(n * 1000) : Math.round(n));
  const compileMs = compile ? toMs(Number(compile[1]), compile[2]) : 0;
  const renderMs = render ? toMs(Number(render[1]), render[2]) : 0;
  return {
    wall_ms: Number(wall[1]),
    dev_compile_ms: compileMs,
    route_render_ms: renderMs,
  };
}
