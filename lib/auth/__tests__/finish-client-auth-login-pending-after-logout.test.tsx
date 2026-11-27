// @vitest-environment jsdom
/**
 * 로그아웃 뒤 「로그인 필요」 창 로그인(`finishClientAuthLogin` 대기 동작 분기) — 공통 준비를 거쳐
 * 로그아웃 표시가 지워지고, 부팅이 「익명」에서 회원으로 다시 돌고, 로그인 사용자 값이 채워진다.
 * 예전(세션 준비만): `{"guard":"1","user":null,"boot":"anonymous","readyEvents":0}` — 설계 §8 재현.
 */
import { describe, expect, it, vi } from "vitest";

const UID = "user-sheet-login";
const PROFILE = { id: UID, nickname: "시트로그인", phone_verified: true };

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: UID, email: "sheet@member.test", user_metadata: {} } }, error: null }),
      getSession: async () => ({ data: { session: { user: { id: UID, email: "sheet@member.test", user_metadata: {} } } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
  }),
}));
vi.mock("@/lib/auth/await-client-supabase-session-ready", () => ({ awaitClientSupabaseSessionReady: async () => true }));
vi.mock("@/lib/auth/require-auth-action", async (orig) => ({
  ...(await orig<object>()),
  consumePendingAuthAction: async () => true,
}));

describe("login-required sheet login after logout", () => {
  it("clears the guard, re-runs boot as member and fills the user", async () => {
    globalThis.fetch = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.includes("/api/me/profile")) {
        return new Response(JSON.stringify({ ok: true, profile: PROFILE }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;

    sessionStorage.setItem("samarket:post_logout_guard", "1"); // 로그아웃
    const boot = await import("@/lib/app-boot/app-boot-store");
    boot.setAppBootAnonymous(); // 로그아웃 뒤 비회원 둘러보기

    const { finishClientAuthLogin } = await import("@/lib/auth/finish-client-auth-login.client");
    await finishClientAuthLogin({ pendingToken: "tok-1" });
    const { ensureAppBoot } = await import("@/lib/app-boot/run-app-boot");
    await ensureAppBoot();

    const { getCurrentUser } = await import("@/lib/auth/get-current-user");
    expect(sessionStorage.getItem("samarket:post_logout_guard")).toBeNull();
    expect(getCurrentUser()?.id).toBe(UID);
    expect(boot.getAppBootSnapshot().status).toBe("ready");
    expect(boot.getAppBootSnapshot().profile?.id).toBe(UID);
  });
});
