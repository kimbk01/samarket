import { beforeEach, describe, expect, it, vi } from "vitest";
import { markRegistrationGatePassthrough, resetRegistrationGatePassthroughForTests } from "@/lib/auth/registration-gate";

/** 설계 2026-11-21 §5-3 — 가입 진행 중 안내: 요청 단계 한 곳 */
const opened = vi.hoisted(() => [] as unknown[]);
vi.mock("@/lib/auth/registration-required-client", () => ({
  openRegistrationRequiredFromApiPayload: (p: unknown) => {
    opened.push(p);
    return true;
  },
}));
vi.mock("@/lib/i18n/runtime-app-language", () => ({ getRuntimeAppLanguage: () => "ko" }));

import {
  isRegistrationGuidanceGatedRequest,
  resetRegistrationGuidanceForTests,
  shouldSuppressForRegistrationGuidance,
  wrapFetchWithRegistrationGuidance,
} from "@/lib/auth/registration-guidance-fetch-gate.client";
import {
  invalidateRegistrationPending,
  resetRegistrationPendingForTests,
  setRegistrationPendingFromServer,
} from "@/lib/auth/registration-pending-state.client";

const ORIGIN = "http://localhost";

beforeEach(() => {
  opened.length = 0;
  resetRegistrationGuidanceForTests();
  resetRegistrationPendingForTests();
  /**
   * 기본 = 가입 관문이 보내지 않는 화면(주소 편집 흐름) — 여기서는 안내 창을 연다.
   * 관문이 보내는 일반 화면에서는 창을 열지 않는다(전체 감사 A15) — 아래 별도 확인.
   */
  vi.stubGlobal("window", {
    location: { href: `${ORIGIN}/mypage/addresses`, origin: ORIGIN, pathname: "/mypage/addresses", search: "" },
  });
});

function okFetch() {
  return vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
}

describe("미리 확인", () => {
  it("빠진 단계를 알고 있고 새 행동이면 보내지 않고 안내 + 403", async () => {
    setRegistrationPendingFromServer("address");
    const base = okFetch();
    const f = wrapFetchWithRegistrationGuidance(base as unknown as typeof fetch);
    const res = await f("/api/philife/posts", { method: "POST" });
    expect(base).not.toHaveBeenCalled();
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toMatchObject({ code: "signup_incomplete", step: "address" });
    expect(body.error).not.toBe("signup_incomplete");
    expect(opened).toHaveLength(1);
  });

  it("글 사진 올리기 5개는 새 행동 — 보내지 않고 안내, 안 쓴 사진 정리(discard)는 그대로 보낸다 (F2 2026-11-27)", async () => {
    setRegistrationPendingFromServer("phone");
    const base = okFetch();
    const f = wrapFetchWithRegistrationGuidance(base as unknown as typeof fetch);
    for (const p of [
      "/api/posts/upload-image",
      "/api/community/upload-image",
      "/api/community/upload-image-from-url",
      "/api/philife/upload-image",
      "/api/philife/upload-image-from-url",
    ]) {
      const res = await f(p, { method: "POST" });
      expect(res.status, p).toBe(403);
      expect(await res.json(), p).toMatchObject({ code: "signup_incomplete", step: "phone" });
    }
    expect(base).not.toHaveBeenCalled();
    await f("/api/community/upload-image/discard", { method: "POST" });
    expect(base).toHaveBeenCalledTimes(1);
  });

  it("관리·정리(해제·수정·읽음)는 그대로 보낸다", async () => {
    setRegistrationPendingFromServer("phone");
    const base = okFetch();
    const f = wrapFetchWithRegistrationGuidance(base as unknown as typeof fetch);
    await f("/api/community/posts/p1/like", { method: "DELETE" });
    await f("/api/me/settings/notices", { method: "POST" });
    await f("/api/community-messenger/rooms/r1/messages/m1", { method: "PATCH" });
    expect(base).toHaveBeenCalledTimes(3);
    expect(opened).toHaveLength(0);
  });

  it("모르면(값 없음·무효화) 그대로 보낸다 — 서버가 판단", async () => {
    setRegistrationPendingFromServer("address");
    invalidateRegistrationPending();
    const base = okFetch();
    const f = wrapFetchWithRegistrationGuidance(base as unknown as typeof fetch);
    await f("/api/philife/posts", { method: "POST" });
    expect(base).toHaveBeenCalledTimes(1);
  });

  it("가입 완료(null)·GET·통화 경로·다른 출처는 건드리지 않는다", async () => {
    setRegistrationPendingFromServer(null);
    const base = okFetch();
    const f = wrapFetchWithRegistrationGuidance(base as unknown as typeof fetch);
    await f("/api/philife/posts", { method: "POST" });
    setRegistrationPendingFromServer("address");
    await f("/api/philife/posts");
    await f("https://other.example/api/philife/posts", { method: "POST" });
    expect(base).toHaveBeenCalledTimes(3);
    expect(isRegistrationGuidanceGatedRequest("POST", "/api/community-messenger/calls/redial-room")).toBe(false);
  });
});

describe("안전망 — 서버 403", () => {
  it("signup_incomplete+step → 안내 1회 + 문구를 사람 말로 · code·step 유지 · 사본 갱신", async () => {
    const base = vi.fn(
      async () =>
        new Response(JSON.stringify({ ok: false, code: "signup_incomplete", error: "signup_incomplete", step: "phone" }), {
          status: 403,
        }),
    );
    const f = wrapFetchWithRegistrationGuidance(base as unknown as typeof fetch);
    const res = await f("/api/community-messenger/friend-requests", { method: "POST" });
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body).toMatchObject({ code: "signup_incomplete", step: "phone" });
    expect(body.error).not.toBe("signup_incomplete");
    expect(opened).toHaveLength(1);
    // 같은 순간 두 번째 거절은 창을 다시 열지 않는다
    await f("/api/community-messenger/friend-requests", { method: "POST" });
    expect(opened).toHaveLength(1);
    // 사본이 갱신돼 다음 새 행동은 보내기 전에 막힌다
    const before = base.mock.calls.length;
    await f("/api/philife/posts", { method: "POST" });
    expect(base.mock.calls.length).toBe(before);
  });

  it("동의 미완(step 없음)·다른 403 은 그대로", async () => {
    const base = vi.fn(async () => new Response(JSON.stringify({ ok: false, code: "signup_incomplete" }), { status: 403 }));
    const f = wrapFetchWithRegistrationGuidance(base as unknown as typeof fetch);
    const res = await f("/api/philife/posts", { method: "POST" });
    expect((await res.json()).code).toBe("signup_incomplete");
    expect(opened).toHaveLength(0);
  });

  it("관문이 왕복 감지로 그대로 연 화면(/philife)이면 창을 연다 — 안내 없는 상태 방지 (감사 검토 #2)", async () => {
    vi.stubGlobal("window", { location: { href: `${ORIGIN}/philife`, origin: ORIGIN, pathname: "/philife", search: "" } });
    resetRegistrationGatePassthroughForTests();
    markRegistrationGatePassthrough("/philife");
    setRegistrationPendingFromServer("address");
    const base = okFetch();
    const f = wrapFetchWithRegistrationGuidance(base as unknown as typeof fetch);
    const res = await f("/api/philife/posts", { method: "POST" });
    expect(res.status).toBe(403);
    expect(opened).toHaveLength(1);
    resetRegistrationGatePassthroughForTests();
  });
});

describe("알림 억제 — 안내 문장과 같은 알림만 (재감사3 #8)", () => {
  it("창을 연 뒤에도 상관없는 오류 알림은 그대로, 안내 문장 알림만 숨김", async () => {
    expect(shouldSuppressForRegistrationGuidance("저장했어요", false)).toBe(false);
    setRegistrationPendingFromServer("address");
    const f = wrapFetchWithRegistrationGuidance(okFetch() as unknown as typeof fetch);
    const res = await f("/api/philife/posts", { method: "POST" });
    const sentence = (await res.json()).error as string;
    expect(shouldSuppressForRegistrationGuidance("응답 실패", true)).toBe(false);
    expect(shouldSuppressForRegistrationGuidance(sentence, true)).toBe(true);
  });
});

describe("가입 관문이 단계 화면으로 보내는 일반 화면 — 안내 창은 열지 않는다 (전체 감사 A15)", () => {
  it("/philife 에서 403 은 그대로 돌려주지만 창은 열지 않는다", async () => {
    vi.stubGlobal("window", { location: { href: `${ORIGIN}/philife`, origin: ORIGIN, pathname: "/philife", search: "" } });
    setRegistrationPendingFromServer("address");
    const base = okFetch();
    const f = wrapFetchWithRegistrationGuidance(base as unknown as typeof fetch);
    const res = await f("/api/philife/posts", { method: "POST" });
    expect(base).not.toHaveBeenCalled();
    expect(res.status).toBe(403);
    expect(opened).toHaveLength(0);
  });
});
