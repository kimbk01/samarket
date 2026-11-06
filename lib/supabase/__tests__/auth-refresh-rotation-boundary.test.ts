/**
 * 갱신 토큰 회전 경계 — 실제 auth-js GoTrueClient + 인증 요청 마감(10초) + GoTrue v2.197.0 v1 토큰 규칙 모사 서버.
 *
 * 운영 설정(Management API, 2026-11-06 11:12 PHT): refresh_token_rotation_enabled=true,
 * security_refresh_token_reuse_interval=10, jwt_exp=3600, sessions_timebox=0, sessions_inactivity_timeout=0.
 * 운영 auth.sessions 의 v2 카운터 세션 0건 → v1 분기만 해당.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GoTrueClient, processLock, type AuthChangeEvent } from "@supabase/auth-js";
import {
  SUPABASE_AUTH_REQUEST_DEADLINE_MS,
  createSupabaseAuthDeadlineFetch,
} from "@/lib/supabase/auth-request-deadline";
import {
  FAKE_AUTH_URL,
  FAKE_USER_ID,
  JWT_EXP_SECONDS,
  REUSE_INTERVAL_MS,
  createGoTrueServer,
  memoryStorage,
  seedExpiredSession,
  type GoTrueServer,
  type ResponsePlan,
} from "./gotrue-fake-server";

let keySeq = 0;

async function createApp(server: GoTrueServer, refreshToken: string) {
  keySeq += 1;
  const storageKey = `boundary-auth-${keySeq}`;
  const storage = memoryStorage();
  const client = new GoTrueClient({
    url: FAKE_AUTH_URL,
    storageKey,
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
  // INITIAL_SESSION 방출(비동기 getSession)이 빈 저장소에서 끝난 뒤 세션을 심는다.
  await vi.advanceTimersByTimeAsync(0);
  seedExpiredSession(storage, storageKey, refreshToken);
  const stored = () => {
    const raw = storage.getItem(storageKey);
    return raw ? (JSON.parse(raw) as { refresh_token: string }).refresh_token : null;
  };
  return { client, events, stored };
}

function setup() {
  const server = createGoTrueServer();
  const { sessionId, refreshToken: r0 } = server.createSession();
  return { server, sessionId, r0 };
}

describe("refresh token rotation boundaries (deadline 10s, reuse interval 10s)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("response delay", () => {
    it("9.9s response (inside the deadline): one request, no retry", async () => {
      const { server, sessionId, r0 } = setup();
      const app = await createApp(server, r0);
      server.plans.push({ delayMs: 9_900 });
      const pending = app.client.getSession();
      await vi.advanceTimersByTimeAsync(9_900);
      const res = await pending;
      expect(res.error).toBeNull();
      expect(server.state.refreshCalls).toBe(1);
      expect(server.state.outcomes).toEqual(["rotated"]);
      expect(app.stored()).toBe(server.activeOf(sessionId));
    });

    it("10.1s response (just over the deadline): retry at 10.2s is past the reuse interval but recovers via the parent rule", async () => {
      const { server, sessionId, r0 } = setup();
      const app = await createApp(server, r0);
      server.plans.push({ delayMs: 10_100 }, "immediate");
      const pending = app.client.getSession();
      await vi.advanceTimersByTimeAsync(SUPABASE_AUTH_REQUEST_DEADLINE_MS + 200);
      const res = await pending;
      expect(res.error).toBeNull();
      expect(server.state.outcomes).toEqual(["rotated", "parent_recovered"]);
      expect(server.state.rotations).toBe(1);
      expect(app.stored()).toBe(server.activeOf(sessionId));
      expect(app.events).not.toContain("SIGNED_OUT");
    });
  });

  describe("response loss", () => {
    it("connection reset after the server committed the rotation: immediate retry recovers the active token", async () => {
      const { server, sessionId, r0 } = setup();
      const app = await createApp(server, r0);
      server.plans.push("lost", "immediate");
      const pending = app.client.getSession();
      await vi.advanceTimersByTimeAsync(200);
      const res = await pending;
      expect(res.error).toBeNull();
      expect(server.state.outcomes).toEqual(["rotated", "parent_recovered"]);
      expect(app.stored()).toBe(server.activeOf(sessionId));
      expect(app.events).not.toContain("SIGNED_OUT");
    });

    it("hang → reset → success across the reuse interval: every resend of the same token is answered by the parent rule", async () => {
      const { server, sessionId, r0 } = setup();
      const app = await createApp(server, r0);
      server.plans.push("hang", "lost", "immediate");
      const pending = app.client.getSession();
      await vi.advanceTimersByTimeAsync(SUPABASE_AUTH_REQUEST_DEADLINE_MS + 200 + 400);
      const res = await pending;
      expect(res.error).toBeNull();
      expect(server.state.outcomes).toEqual(["rotated", "parent_recovered", "parent_recovered"]);
      expect(server.state.rotations).toBe(1);
      expect(app.stored()).toBe(server.activeOf(sessionId));
      expect(app.events).not.toContain("SIGNED_OUT");
    });

    it("single holder, all three deadline attempts committed server-side: never Already Used, next call recovers", async () => {
      const { server, sessionId, r0 } = setup();
      const app = await createApp(server, r0);
      server.plans.push("hang", "hang", "hang");
      const pending = app.client.getSession();
      await vi.advanceTimersByTimeAsync(31_000);
      const res = await pending;
      expect(res.error?.name).toBe("AuthRetryableFetchError");
      expect(app.stored()).toBe(r0);
      expect(server.state.outcomes).toEqual(["rotated", "parent_recovered", "parent_recovered"]);

      await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
      const next = await app.client.getSession();
      expect(next.error).toBeNull();
      expect(next.data.session?.user.id).toBe(FAKE_USER_ID);
      expect(app.stored()).toBe(server.activeOf(sessionId));
      expect(server.state.outcomes).not.toContain("already_used");
      expect(app.events).not.toContain("SIGNED_OUT");
    });
  });

  describe("duplicate refresh", () => {
    it("same app, concurrent getSession callers: one network refresh; a forced refreshSession waits and rotates the new token (never resends the old one)", async () => {
      const { server, sessionId, r0 } = setup();
      const app = await createApp(server, r0);
      server.plans.push({ delayMs: 3_000 });
      const all = Promise.all([app.client.getSession(), app.client.getSession(), app.client.refreshSession()]);
      await vi.advanceTimersByTimeAsync(3_000);
      const results = await all;
      expect(results.every((r) => r.error === null)).toBe(true);
      expect(server.state.outcomes).toEqual(["rotated", "rotated"]);
      expect(app.stored()).toBe(server.activeOf(sessionId));
      expect(app.events).not.toContain("SIGNED_OUT");
    });

    it("two holders of the same token (other tab / server proxy cookie copy) refresh at once: both converge, no logout", async () => {
      const { server, sessionId, r0 } = setup();
      const a = await createApp(server, r0);
      const b = await createApp(server, r0);
      const [ra, rb] = await Promise.all([a.client.getSession(), b.client.getSession()]);
      expect(ra.error).toBeNull();
      expect(rb.error).toBeNull();
      expect(server.state.outcomes).toEqual(["rotated", "parent_recovered"]);
      expect(a.stored()).toBe(server.activeOf(sessionId));
      expect(b.stored()).toBe(server.activeOf(sessionId));
      expect(a.events).not.toContain("SIGNED_OUT");
      expect(b.events).not.toContain("SIGNED_OUT");
    });

    it("proxy refreshed with the cookie token; the client's copy of that token hours later still recovers (parent rule has no time limit)", async () => {
      const { server, sessionId, r0 } = setup();
      const app = await createApp(server, r0);
      expect(server.refreshAsOtherActor(r0).outcome).toBe("rotated");
      await vi.advanceTimersByTimeAsync(2 * 60 * 60 * 1000);
      const res = await app.client.getSession();
      expect(res.error).toBeNull();
      expect(server.state.outcomes).toEqual(["rotated", "parent_recovered"]);
      expect(app.stored()).toBe(server.activeOf(sessionId));
      expect(app.events).not.toContain("SIGNED_OUT");
    });
  });

  describe("consecutive rotation / reuse interval", () => {
    it("stale token replayed within 10s of its revocation after the family rotated twice: reuse swap, no logout", async () => {
      const { server, r0 } = setup();
      const app = await createApp(server, r0);
      const r1 = server.refreshAsOtherActor(r0).body.refresh_token as string;
      server.refreshAsOtherActor(r1);
      await vi.advanceTimersByTimeAsync(REUSE_INTERVAL_MS - 1);
      const res = await app.client.getSession();
      expect(res.error).toBeNull();
      expect(server.state.outcomes).toEqual(["rotated", "rotated", "reuse_swapped"]);
      expect(server.tokens.get(app.stored()!)!.parent).toBe(r0);
      expect(app.events).not.toContain("SIGNED_OUT");
    });

    it("stale token replayed after the reuse interval when the family rotated twice: Already Used → family revoked → forced logout of every holder", async () => {
      const { server, r0 } = setup();
      const app = await createApp(server, r0);
      const r1 = server.refreshAsOtherActor(r0).body.refresh_token as string;
      const r2 = server.refreshAsOtherActor(r1).body.refresh_token as string;
      await vi.advanceTimersByTimeAsync(REUSE_INTERVAL_MS + 1);
      const res = await app.client.getSession();
      expect(res.data.session).toBeNull();
      expect(res.error?.name).not.toBe("AuthRetryableFetchError");
      expect(app.stored()).toBeNull();
      expect(app.events).toContain("SIGNED_OUT");
      expect(server.state.familyRevoked).toBe(true);
      // r2 를 가진 쪽도 다음 갱신(허용 시간 경과 후)에서 Already Used
      await vi.advanceTimersByTimeAsync(REUSE_INTERVAL_MS + 1);
      expect(server.refreshAsOtherActor(r2).outcome).toBe("already_used");
    });

    it("only one rotation since the stale token (no grandchild): replay after any delay recovers", async () => {
      const { server, sessionId, r0 } = setup();
      const app = await createApp(server, r0);
      server.refreshAsOtherActor(r0);
      await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
      const res = await app.client.getSession();
      expect(res.error).toBeNull();
      expect(app.stored()).toBe(server.activeOf(sessionId));
      expect(server.state.outcomes).toEqual(["rotated", "parent_recovered"]);
    });

    it("forced-logout trigger with the deadline: another holder rotates twice inside the client's retry window", async () => {
      const { server, r0 } = setup();
      const app = await createApp(server, r0);
      server.plans.push("hang", "immediate");
      const pending = app.client.getSession();
      // t=0 서버 회전 r0→r1 (응답 미도착). t=2s 다른 주체가 r0 로 parent 복구 → r1 획득, t=4s r1 을 강제 갱신 → r2
      await vi.advanceTimersByTimeAsync(2_000);
      const r1 = server.refreshAsOtherActor(r0).body.refresh_token as string;
      await vi.advanceTimersByTimeAsync(2_000);
      server.refreshAsOtherActor(r1);
      // t=10.2s 마감 재시도: r0 폐기 후 10초 경과 + 활성 r2 의 parent ≠ r0 → Already Used
      await vi.advanceTimersByTimeAsync(SUPABASE_AUTH_REQUEST_DEADLINE_MS - 4_000 + 200);
      const res = await pending;
      expect(server.state.outcomes).toEqual(["rotated", "parent_recovered", "rotated", "already_used"]);
      expect(res.data.session).toBeNull();
      expect(app.events).toContain("SIGNED_OUT");
    });
  });

  describe("normal user", () => {
    it("48 hours of hourly refreshes with delays, losses, body stalls and proxy duplicates: never logged out", async () => {
      const { server, sessionId, r0 } = setup();
      const app = await createApp(server, r0);
      const cycle: ResponsePlan[][] = [
        ["immediate"],
        [{ delayMs: 15_000 }, "immediate"],
        ["lost", "immediate"],
        ["body_stall", "immediate"],
        ["hang", "hang", "immediate"],
        ["offline", "offline", "immediate"],
      ];
      for (let hour = 0; hour < 48; hour += 1) {
        server.plans.length = 0;
        server.plans.push(...cycle[hour % cycle.length]!);
        const current = app.stored()!;
        // 짝수 시간: 같은 순간 서버 proxy 가 쿠키의 같은 토큰으로 먼저 갱신
        if (hour % 2 === 0) server.refreshAsOtherActor(current);
        const pending = app.client.getSession();
        await vi.advanceTimersByTimeAsync(31_000);
        const res = await pending;
        if (res.error) {
          expect(res.error.name).toBe("AuthRetryableFetchError");
          const again = await app.client.getSession();
          expect(again.error).toBeNull();
        }
        expect(app.stored()).toBe(server.activeOf(sessionId));
        // 홀수 시간: proxy 가 갱신 직후의 낡은 쿠키(이전 토큰)로 늦게 갱신
        if (hour % 2 === 1) expect(server.refreshAsOtherActor(current).outcome).toBe("parent_recovered");
        await vi.advanceTimersByTimeAsync(JWT_EXP_SECONDS * 1000);
      }
      expect(server.state.outcomes).not.toContain("already_used");
      expect(server.state.familyRevoked).toBe(false);
      expect(app.events).not.toContain("SIGNED_OUT");
      expect(app.stored()).toBe(server.activeOf(sessionId));
    });
  });
});
