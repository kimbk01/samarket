// @vitest-environment jsdom
/**
 * 정상 로그인 생애주기 — 제품 `getSupabaseClient()`(@supabase/ssr 쿠키 저장소 + 인증 요청 마감 fetch + 실제 auth-js)
 * 를 그대로 띄우고 네트워크만 GoTrue v2.197.0 모사 서버로 바꾼다.
 *
 * 앱 재시작(재진입)은 모듈을 새로 읽어 새 클라이언트를 만든다 — 쿠키(document.cookie)는 유지.
 * `@supabase/ssr` 의 브라우저 싱글톤 캐시만 끈다(옵션은 제품 코드 그대로 전달).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthChangeEvent, SupabaseClient } from "@supabase/supabase-js";
import {
  FAKE_AUTH_ORIGIN,
  FAKE_EMAIL,
  FAKE_PASSWORD,
  FAKE_USER_ID,
  JWT_EXP_SECONDS,
  createGoTrueServer,
  type GoTrueServer,
} from "./gotrue-fake-server";

vi.mock("@supabase/ssr", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@supabase/ssr")>();
  return {
    ...actual,
    createBrowserClient: ((url: string, key: string, options?: Record<string, unknown>) =>
      actual.createBrowserClient(url, key, { ...options, isSingleton: false })) as typeof actual.createBrowserClient,
  };
});

const AUTH_COOKIE = "sb-proj-auth-token";
let visibility: DocumentVisibilityState = "visible";
const liveClients: SupabaseClient[] = [];

function clearCookies() {
  for (const part of document.cookie.split(";")) {
    const name = part.split("=")[0]?.trim();
    if (name) document.cookie = `${name}=; Max-Age=0; path=/`;
  }
}

function authCookieNames(): string[] {
  return document.cookie
    .split(";")
    .map((p) => p.split("=")[0]?.trim() ?? "")
    .filter((n) => n.startsWith(AUTH_COOKIE));
}

/** 앱 시작 1회 = 모듈 새로 읽기 + 제품 클라이언트 생성 */
async function launchApp(): Promise<{ sb: SupabaseClient; events: AuthChangeEvent[] }> {
  vi.resetModules();
  const { getSupabaseClient } = await import("@/lib/supabase/client");
  const sb = getSupabaseClient();
  if (!sb) throw new Error("client not created");
  liveClients.push(sb);
  const events: AuthChangeEvent[] = [];
  sb.auth.onAuthStateChange((event) => {
    events.push(event);
  });
  await vi.advanceTimersByTimeAsync(0);
  return { sb, events };
}

/** 앱 프로세스 종료 — 타이머·리스너 정리 (쿠키는 남는다) */
async function killApp(sb: SupabaseClient) {
  await sb.auth.stopAutoRefresh();
  const idx = liveClients.indexOf(sb);
  if (idx >= 0) liveClients.splice(idx, 1);
}

async function setVisibility(next: DocumentVisibilityState) {
  visibility = next;
  document.dispatchEvent(new Event("visibilitychange"));
  window.dispatchEvent(new Event("visibilitychange"));
  await vi.advanceTimersByTimeAsync(0);
}

let server: GoTrueServer;

describe("login lifecycle through the production supabase browser client", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", FAKE_AUTH_ORIGIN);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    server = createGoTrueServer();
    vi.stubGlobal("fetch", server.fetchImpl);
    visibility = "visible";
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
    clearCookies();
  });

  afterEach(async () => {
    for (const sb of [...liveClients]) await killApp(sb);
    clearCookies();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("wrong password is rejected and stores nothing", async () => {
    const { sb, events } = await launchApp();
    const res = await sb.auth.signInWithPassword({ email: FAKE_EMAIL, password: "wrong" });
    expect(res.error?.message).toBe("Invalid login credentials");
    expect(res.data.session).toBeNull();
    expect(authCookieNames()).toEqual([]);
    expect(events).not.toContain("SIGNED_IN");
  });

  it("login → session saved → hourly auto refresh → resume after idle → cold restart → logout", async () => {
    // 1) 정상 로그인
    const first = await launchApp();
    const login = await first.sb.auth.signInWithPassword({ email: FAKE_EMAIL, password: FAKE_PASSWORD });
    expect(login.error).toBeNull();
    expect(login.data.session?.user.id).toBe(FAKE_USER_ID);
    expect(server.state.passwordGrants).toBe(1);
    expect(first.events).toContain("SIGNED_IN");
    const sessionId = [...server.sessions][0]!;
    const loginRefreshToken = login.data.session!.refresh_token;

    // 2) 세션 저장 — 쿠키(@supabase/ssr)에 기록, 같은 클라이언트 getSession 은 네트워크 없이 반환
    expect(authCookieNames().length).toBeGreaterThan(0);
    const saved = await first.sb.auth.getSession();
    expect(saved.data.session?.refresh_token).toBe(loginRefreshToken);
    expect(server.state.refreshCalls).toBe(0);

    // 3) 토큰 갱신 — 화면이 켜진 채 만료 직전이 되면 auth-js 30초 ticker 가 갱신
    await vi.advanceTimersByTimeAsync((JWT_EXP_SECONDS - 60) * 1000);
    expect(server.state.refreshCalls).toBe(1);
    expect(server.state.outcomes).toEqual(["rotated"]);
    expect(first.events).toContain("TOKEN_REFRESHED");
    const afterTick = await first.sb.auth.getSession();
    expect(afterTick.data.session?.refresh_token).toBe(server.activeOf(sessionId));

    // 4) 앱 백그라운드 2시간 → 복귀(visibilitychange) — 만료된 세션을 즉시 갱신해 복구
    await setVisibility("hidden");
    const refreshesBeforeIdle = server.state.refreshCalls;
    await vi.advanceTimersByTimeAsync(2 * 60 * 60 * 1000);
    expect(server.state.refreshCalls).toBe(refreshesBeforeIdle);
    await setVisibility("visible");
    await vi.advanceTimersByTimeAsync(100);
    expect(server.state.refreshCalls).toBe(refreshesBeforeIdle + 1);
    const resumed = await first.sb.auth.getSession();
    expect(resumed.error).toBeNull();
    expect(resumed.data.session?.user.id).toBe(FAKE_USER_ID);
    expect(resumed.data.session?.refresh_token).toBe(server.activeOf(sessionId));
    expect(first.events).not.toContain("SIGNED_OUT");

    // 5) 앱 종료 후 3시간 뒤 재시작 — 쿠키에서 세션 복원(만료 → 갱신)
    await killApp(first.sb);
    await vi.advanceTimersByTimeAsync(3 * 60 * 60 * 1000);
    const second = await launchApp();
    const restored = await second.sb.auth.getSession();
    expect(restored.error).toBeNull();
    expect(restored.data.session?.user.id).toBe(FAKE_USER_ID);
    expect(restored.data.session?.refresh_token).toBe(server.activeOf(sessionId));
    expect(server.state.familyRevoked).toBe(false);
    expect(second.events).not.toContain("SIGNED_OUT");

    // 6) 바로 다시 재시작 — 만료 전이면 네트워크 없이 복원
    await killApp(second.sb);
    const refreshesBeforeWarm = server.state.refreshCalls;
    const third = await launchApp();
    const warm = await third.sb.auth.getSession();
    expect(warm.data.session?.refresh_token).toBe(server.activeOf(sessionId));
    expect(server.state.refreshCalls).toBe(refreshesBeforeWarm);

    // 7) 로그아웃 — 서버 세션 삭제 + 쿠키 삭제 + SIGNED_OUT
    const out = await third.sb.auth.signOut();
    expect(out.error).toBeNull();
    expect(server.state.logoutCalls).toBe(1);
    expect(server.sessions.size).toBe(0);
    expect(authCookieNames()).toEqual([]);
    expect(third.events).toContain("SIGNED_OUT");
    expect((await third.sb.auth.getSession()).data.session).toBeNull();

    // 로그아웃 후 재시작해도 세션 없음
    await killApp(third.sb);
    const fourth = await launchApp();
    expect((await fourth.sb.auth.getSession()).data.session).toBeNull();
    expect(server.state.outcomes).not.toContain("already_used");
  });

  it("network failure during refresh keeps the member signed in; recovery restores a fresh session", async () => {
    const app = await launchApp();
    await app.sb.auth.signInWithPassword({ email: FAKE_EMAIL, password: FAKE_PASSWORD });
    const sessionId = [...server.sessions][0]!;

    // 백그라운드 2시간 후 복귀 시점부터 서버 무응답(회전은 커밋됨) 3회 + 오프라인
    await setVisibility("hidden");
    await vi.advanceTimersByTimeAsync(2 * 60 * 60 * 1000);
    server.plans.push("hang", "hang", "hang", "offline", "offline", "offline", "offline", "offline", "offline");
    await setVisibility("visible");
    await vi.advanceTimersByTimeAsync(45_000);

    expect(server.state.refreshCalls).toBeGreaterThanOrEqual(3);
    expect(app.events).not.toContain("SIGNED_OUT");
    expect(authCookieNames().length).toBeGreaterThan(0);
    expect(server.state.familyRevoked).toBe(false);

    // 네트워크 복구 — 다음 ticker/호출에서 회원 세션 복구 (서버가 이미 회전했으면 parent 복구)
    server.plans.length = 0;
    await vi.advanceTimersByTimeAsync(60_000);
    const recovered = await app.sb.auth.getSession();
    expect(recovered.error).toBeNull();
    expect(recovered.data.session?.user.id).toBe(FAKE_USER_ID);
    expect(recovered.data.session?.refresh_token).toBe(server.activeOf(sessionId));
    expect(app.events).not.toContain("SIGNED_OUT");
    expect(server.state.outcomes).not.toContain("already_used");
    expect(server.state.outcomes).toContain("parent_recovered");
  });
});
