/**
 * 설계 §24 D5 보완 (Auth HARD LOCK Amendment 2026-11-18 (2)) — 공용 세션 조회가 Supabase 준비를 기다리는 사이
 * 경계 컴포넌트의 직접 확인이 진행 중이면 그 결과에 합류한다. 실측: 세션 관리자 + 경계 확인 = /api/auth/session 2회(6회 중 5회).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

let releaseReady: (() => void) | null = null;
vi.mock("@/lib/auth/await-client-supabase-session-ready", () => ({
  awaitClientSupabaseSessionReady: () =>
    new Promise<void>((r) => {
      releaseReady = r;
    }),
}));
vi.mock("@/lib/auth/guest-auth-boot-markers", () => ({ logGuestAuthBootMarker: vi.fn() }));
const noteGuest401 = vi.fn();
vi.mock("@/lib/auth/guest-auth-state", () => ({
  isGuestAuthEstablished: () => false,
  isRecoverableGuestAuthEstablished: () => false,
  logGuestFetchSkipped: vi.fn(),
  noteGuest401: (...a: unknown[]) => noteGuest401(...a),
}));
vi.mock("@/lib/http/fetch-client-telemetry", () => ({
  isLikelyFetchAbortError: () => false,
  logFetchClientTelemetry: vi.fn(),
}));

import {
  clearAuthSessionClientCache,
  fetchAuthSessionNoStore,
  noteAuthSessionClientOk,
  peekAuthSessionClientOk,
  trackAuthSessionBoundaryProbe,
} from "@/lib/auth/fetch-auth-session-client";

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();

async function flushMicrotasks() {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  noteGuest401.mockReset();
  clearAuthSessionClientCache();
  releaseReady = null;
});

describe("공용 조회 ↔ 경계 확인 합류", () => {
  it("경계 확인이 진행 중 → 「로그인됨」이면 공용 조회는 요청하지 않는다(요청 1회)", async () => {
    let resolveProbe: (v: boolean) => void = () => {};
    const shared = fetchAuthSessionNoStore("ensureHealthy:bindAuthListener");
    await flushMicrotasks();
    trackAuthSessionBoundaryProbe(new Promise<boolean>((r) => (resolveProbe = r)));
    releaseReady?.();
    await flushMicrotasks();
    resolveProbe(true);
    const res = await shared;
    expect(fetchMock).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, authenticated: true });
    expect(peekAuthSessionClientOk()).toBe(true);
  });

  it("경계 확인이 「로그인됨」이 아니면 지금처럼 직접 요청(401 → 비회원 처리 그대로)", async () => {
    // 401 은 기존 동작대로 1회 재시도 — 호출마다 새 응답
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ ok: false }), { status: 401 }));
    const shared = fetchAuthSessionNoStore("ensureHealthy:bindAuthListener");
    await flushMicrotasks();
    trackAuthSessionBoundaryProbe(Promise.resolve(false));
    releaseReady?.();
    const res = await shared;
    expect(fetchMock).toHaveBeenCalled();
    expect(res.status).toBe(401);
    expect(noteGuest401).toHaveBeenCalled();
  });

  it("기다린 사이 다른 확인이 캐시를 남겼으면 요청하지 않는다", async () => {
    const shared = fetchAuthSessionNoStore("x");
    await flushMicrotasks();
    noteAuthSessionClientOk();
    releaseReady?.();
    const res = await shared;
    expect(fetchMock).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
  });

  it("경계 확인이 실패(예외)해도 공용 조회는 직접 요청한다", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true, authenticated: true }), { status: 200 }));
    const shared = fetchAuthSessionNoStore("x");
    await flushMicrotasks();
    trackAuthSessionBoundaryProbe(Promise.reject(new Error("net")));
    releaseReady?.();
    const res = await shared;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
  });
});
