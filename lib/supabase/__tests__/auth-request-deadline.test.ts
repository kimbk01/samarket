/**
 * 인증 요청 마감 — 실제 auth-js(2.99.2) GoTrueClient + GoTrue v2.197.0 갱신 규칙 모사 서버(`gotrue-fake-server.ts`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GoTrueClient, processLock, type AuthChangeEvent } from "@supabase/auth-js";
import {
  SUPABASE_AUTH_REQUEST_DEADLINE_MS,
  createSupabaseAuthDeadlineFetch,
  isSupabaseAuthRequestUrl,
} from "@/lib/supabase/auth-request-deadline";
import {
  FAKE_AUTH_URL as AUTH_URL,
  FAKE_USER_ID,
  createGoTrueServer,
  memoryStorage,
  seedExpiredSession,
  type GoTrueServer,
} from "./gotrue-fake-server";

const STORAGE_KEY = "test-auth-token";

async function setupClient(server: GoTrueServer) {
  const storage = memoryStorage();
  const client = new GoTrueClient({
    url: AUTH_URL,
    storageKey: STORAGE_KEY,
    storage,
    persistSession: true,
    autoRefreshToken: false,
    detectSessionInUrl: false,
    lock: processLock,
    fetch: createSupabaseAuthDeadlineFetch(server.fetchImpl),
  });
  await client.initialize();
  const events: AuthChangeEvent[] = [];
  client.onAuthStateChange((event) => {
    events.push(event);
  });
  const { sessionId, refreshToken: r0 } = server.createSession();
  seedExpiredSession(storage, STORAGE_KEY, r0);
  return { client, storage, events, r0, sessionId };
}

function storedRefreshToken(storage: ReturnType<typeof memoryStorage>): string | null {
  const raw = storage.getItem(STORAGE_KEY);
  return raw ? (JSON.parse(raw) as { refresh_token: string }).refresh_token : null;
}

describe("supabase auth request deadline", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("applies only to /auth/v1/ requests", () => {
    expect(isSupabaseAuthRequestUrl(`${AUTH_URL}/token?grant_type=refresh_token`)).toBe(true);
    expect(isSupabaseAuthRequestUrl("https://proj.supabase.co/rest/v1/profiles")).toBe(false);
    expect(isSupabaseAuthRequestUrl("https://proj.supabase.co/storage/v1/object/x")).toBe(false);
  });

  it("non-auth requests are passed through without a deadline", async () => {
    const base = vi.fn(
      (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Promise<Response>((resolve) => setTimeout(() => resolve(new Response("ok")), 60_000)),
    );
    const wrapped = createSupabaseAuthDeadlineFetch(base as unknown as typeof fetch);
    const pending = wrapped("https://proj.supabase.co/storage/v1/object/upload", { method: "POST" });
    await vi.advanceTimersByTimeAsync(60_000);
    await expect(pending).resolves.toBeInstanceOf(Response);
    expect(base.mock.calls[0]?.[1]).toEqual({ method: "POST" });
  });

  it("normal refresh rotates once and saves the new token", async () => {
    const server = createGoTrueServer();
    const { client, storage, events, r0 } = await setupClient(server);
    const res = await client.getSession();
    expect(res.error).toBeNull();
    const r1 = res.data.session?.refresh_token;
    expect(r1).not.toBe(r0);
    expect(storedRefreshToken(storage)).toBe(r1);
    expect(server.state.refreshCalls).toBe(1);
    expect(events).toContain("TOKEN_REFRESHED");
    expect(events).not.toContain("SIGNED_OUT");
  });

  it("server rotated but response was slower than the deadline: retry with the same token recovers the active token (no logout)", async () => {
    const server = createGoTrueServer();
    const { client, storage, events, r0, sessionId } = await setupClient(server);
    server.plans.push({ delayMs: 15_000 }, "immediate");

    const pending = client.getSession();
    // 마감(10s) → 200ms backoff → 같은 r0 재전송. 서버 회전 시각에서 10.2초 뒤 = 재사용 허용 시간(10초) 밖.
    await vi.advanceTimersByTimeAsync(SUPABASE_AUTH_REQUEST_DEADLINE_MS + 200);
    const res = await pending;

    expect(res.error).toBeNull();
    const active = server.activeOf(sessionId);
    expect(res.data.session?.refresh_token).toBe(active);
    expect(server.tokens.get(active!)!.parent).toBe(r0);
    expect(server.state.refreshCalls).toBe(2);
    expect(server.state.rotations).toBe(1);
    expect(server.state.familyRevoked).toBe(false);
    expect(storedRefreshToken(storage)).toBe(active);
    expect(events).not.toContain("SIGNED_OUT");

    // 끊긴 첫 응답이 늦게 도착할 시각이 지나도 상태를 덮어쓰지 않는다.
    const refreshedCount = events.filter((e) => e === "TOKEN_REFRESHED").length;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(events.filter((e) => e === "TOKEN_REFRESHED").length).toBe(refreshedCount);
    expect(storedRefreshToken(storage)).toBe(active);
  });

  it("server rotated but response body stalled: deadline covers body read, retry recovers", async () => {
    const server = createGoTrueServer();
    const { client, storage, events, sessionId } = await setupClient(server);
    server.plans.push("body_stall", "immediate");

    const pending = client.getSession();
    await vi.advanceTimersByTimeAsync(SUPABASE_AUTH_REQUEST_DEADLINE_MS + 200);
    const res = await pending;

    expect(res.error).toBeNull();
    expect(res.data.session?.refresh_token).toBe(server.activeOf(sessionId));
    expect(storedRefreshToken(storage)).toBe(server.activeOf(sessionId));
    expect(server.state.familyRevoked).toBe(false);
    expect(events).not.toContain("SIGNED_OUT");
  });

  it("unresponsive auth server: getSession ends within the auth-js retry window, session kept, lock released", async () => {
    const server = createGoTrueServer();
    const { client, storage, events, r0 } = await setupClient(server);
    server.plans.push("hang", "hang", "hang", "hang", "hang");

    let settled = false;
    const pending = client.getSession().finally(() => {
      settled = true;
    });
    // 0–10s, 10.2–20.2s, 20.6–30.6s 시도 후 종료 (다음 backoff 가 30초 창을 넘음)
    await vi.advanceTimersByTimeAsync(30_000);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(700);
    expect(settled).toBe(true);
    const res = await pending;

    expect(res.data.session).toBeNull();
    expect(res.error?.name).toBe("AuthRetryableFetchError");
    expect(server.state.refreshCalls).toBe(3);
    expect(storedRefreshToken(storage)).toBe(r0);
    expect(events).not.toContain("SIGNED_OUT");

    // 잠금·공유 갱신 해제 — 네트워크 복구 후 다음 호출은 바로 새 요청으로 회원 복구
    server.plans.length = 0;
    const next = await client.getSession();
    expect(next.error).toBeNull();
    expect(next.data.session?.user?.id).toBe(FAKE_USER_ID);
    expect(server.state.familyRevoked).toBe(false);
  });

  it("control: without the deadline the same unresponsive refresh never settles (20 min)", async () => {
    // 멈춘 갱신은 저장 키 단위 processLock 을 영구 점유한다 — 다른 테스트와 키를 분리한다.
    const CONTROL_KEY = "control-auth-token";
    const server = createGoTrueServer();
    const storage = memoryStorage();
    const client = new GoTrueClient({
      url: AUTH_URL,
      storageKey: CONTROL_KEY,
      storage,
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      lock: processLock,
      fetch: server.fetchImpl,
    });
    await client.initialize();
    seedExpiredSession(storage, CONTROL_KEY, server.createSession().refreshToken);
    server.plans.push("hang");
    let settled = false;
    void client.getSession().finally(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(20 * 60_000);
    expect(settled).toBe(false);
    expect(server.state.refreshCalls).toBe(1);
  });

  it("concurrent getSession/refresh callers share a single refresh request", async () => {
    const server = createGoTrueServer();
    const { client } = await setupClient(server);
    server.plans.push({ delayMs: 2_000 });

    const all = Promise.all([client.getSession(), client.getSession(), client.getSession()]);
    await vi.advanceTimersByTimeAsync(2_000);
    const results = await all;

    expect(server.state.refreshCalls).toBe(1);
    const tokens = new Set(results.map((r) => r.data.session?.refresh_token));
    expect(tokens.size).toBe(1);
    expect(results.every((r) => r.error === null)).toBe(true);
  });

  it("revoked refresh token keeps the existing security policy (session removed, SIGNED_OUT)", async () => {
    const server = createGoTrueServer();
    const { client, storage, events, r0 } = await setupClient(server);
    server.tokens.delete(r0);

    const res = await client.getSession();
    expect(res.data.session).toBeNull();
    expect(res.error?.name).not.toBe("AuthRetryableFetchError");
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
    expect(events).toContain("SIGNED_OUT");
  });
});
