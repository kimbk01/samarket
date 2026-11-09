/**
 * D3 (Owner 승인 2026-11-09) — 로그인 후 새로고침 없이 V4 Provider 사용자 ID 채우기.
 * 앱 공용 인증 통로(`subscribeDibayAuthStateChange`)를 실제 세션 매니저 fan-out(`dispatchDibayAuthStateChangeForTests`)으로 구동한다.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@supabase/supabase-js";
import { dispatchDibayAuthStateChangeForTests } from "@/lib/auth/dibay-session-manager";
import { subscribeCallV4ProviderUserIdFill } from "@/lib/community-messenger/call-v4/call-v4-provider-user-id-fill";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const sess = (id: string) => ({ user: { id }, access_token: "t", expires_at: 9_999_999_999 }) as unknown as Session;
const flush = async () => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
};

let current: string | null;
let resolveUserId: ReturnType<typeof vi.fn>;
let apply: ReturnType<typeof vi.fn>;
let stop: () => void;

function start(initial: string | null, resolved: string | null) {
  current = initial;
  resolveUserId = vi.fn(async () => resolved);
  apply = vi.fn((id: string) => {
    current = id;
  });
  stop = subscribeCallV4ProviderUserIdFill({ readCurrent: () => current, resolveUserId, apply });
}

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  stop?.();
  vi.restoreAllMocks();
});

describe("D3 — 비어 있을 때만 채운다", () => {
  it("로그아웃 상태로 마운트 → SIGNED_IN → 실제 ID 다시 읽어 1회 채움(수신 탐지 시작 조건)", async () => {
    start(null, A);
    dispatchDibayAuthStateChangeForTests("SIGNED_IN", sess(A));
    await flush();
    expect(resolveUserId).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith(A);
  });

  it("같은 ID 토큰 갱신 → 다시 읽기·적용 0 (구독·조회 재시작 없음)", async () => {
    start(A, A);
    dispatchDibayAuthStateChangeForTests("TOKEN_REFRESHED", sess(A));
    dispatchDibayAuthStateChangeForTests("TOKEN_REFRESHED", sess(A));
    await flush();
    expect(resolveUserId).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
  });

  it("이미 A 인데 B 로그인 이벤트 → 바꾸지 않음(계정 전환은 기존 전체 새로고침 경로 담당 · 이전 계정 혼입 없음)", async () => {
    start(A, B);
    dispatchDibayAuthStateChangeForTests("SIGNED_IN", sess(B));
    await flush();
    expect(resolveUserId).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
    expect(current).toBe(A);
  });

  it("SIGNED_OUT → 비우지 않음(진행 중 통화 보호 · 명시 로그아웃은 전체 새로고침이 정리)", async () => {
    start(A, null);
    dispatchDibayAuthStateChangeForTests("SIGNED_OUT", null);
    await flush();
    expect(apply).not.toHaveBeenCalled();
    expect(current).toBe(A);
  });

  it("비명시 SIGNED_OUT 후 같은 계정 복구 이벤트 → ID 가 남아 있어 재적용 0(재로드 복구 effect 재실행 없음)", async () => {
    start(A, A);
    dispatchDibayAuthStateChangeForTests("SIGNED_OUT", null);
    dispatchDibayAuthStateChangeForTests("SIGNED_IN", sess(A));
    await flush();
    expect(apply).not.toHaveBeenCalled();
  });

  it("다시 읽은 ID 가 없으면 적용 안 함", async () => {
    start(null, null);
    dispatchDibayAuthStateChangeForTests("SIGNED_IN", sess(A));
    await flush();
    expect(apply).not.toHaveBeenCalled();
  });

  it("세션 없는 이벤트·관계없는 이벤트는 무시", async () => {
    start(null, A);
    dispatchDibayAuthStateChangeForTests("SIGNED_IN", null);
    dispatchDibayAuthStateChangeForTests("PASSWORD_RECOVERY", sess(A));
    await flush();
    expect(resolveUserId).not.toHaveBeenCalled();
  });

  it("이벤트가 몰려도 다시 읽기 1회(중복 조회 없음) · 적용 1회", async () => {
    start(null, A);
    dispatchDibayAuthStateChangeForTests("INITIAL_SESSION", sess(A));
    dispatchDibayAuthStateChangeForTests("SIGNED_IN", sess(A));
    dispatchDibayAuthStateChangeForTests("TOKEN_REFRESHED", sess(A));
    await flush();
    expect(resolveUserId).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it("다시 읽는 사이 이미 채워졌으면 적용 안 함", async () => {
    current = null;
    let release!: (v: string | null) => void;
    resolveUserId = vi.fn(() => new Promise<string | null>((r) => (release = r)));
    apply = vi.fn();
    stop = subscribeCallV4ProviderUserIdFill({ readCurrent: () => current, resolveUserId, apply });
    dispatchDibayAuthStateChangeForTests("SIGNED_IN", sess(A));
    current = A;
    release(A);
    await flush();
    expect(apply).not.toHaveBeenCalled();
  });

  it("구독 해제 후 이벤트 → 아무것도 안 함", async () => {
    start(null, A);
    stop();
    dispatchDibayAuthStateChangeForTests("SIGNED_IN", sess(A));
    await flush();
    expect(resolveUserId).not.toHaveBeenCalled();
  });
});

describe("D3 — Provider 배선 계약(소스)", () => {
  const src = readFileSync(join(process.cwd(), "components/community-messenger/call-v4/CallV4Provider.tsx"), "utf8");
  it("공용 통로 헬퍼만 쓰고 onAuthStateChange 를 직접 구독하지 않는다", () => {
    expect(src).toContain("subscribeCallV4ProviderUserIdFill(");
    expect(src).not.toMatch(/onAuthStateChange\s*\(/);
  });
  it("마운트 결과와 로그인 채움 모두 기존 값을 덮지 않는다(prev ?? id)", () => {
    const n = (src.match(/setUserId\(\(prev\) => prev \?\? id\)/g) ?? []).length;
    expect(n).toBe(2);
    expect(src).not.toMatch(/setUserId\(null\)/);
  });
});
