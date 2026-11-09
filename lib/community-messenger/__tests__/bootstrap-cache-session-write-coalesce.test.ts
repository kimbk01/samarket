import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CommunityMessengerBootstrap } from "@/lib/community-messenger/types";

function makeStorage() {
  const map = new Map<string, string>();
  const setItem = vi.fn((k: string, v: string) => void map.set(k, v));
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem,
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  };
}

function boot(id: string, rooms: number): CommunityMessengerBootstrap {
  return { me: { id }, chats: Array.from({ length: rooms }, (_, i) => ({ id: `r${i}` })) } as unknown as CommunityMessengerBootstrap;
}

const KEY = "samarket.messenger.bootstrap.v1";

describe("messenger bootstrap full — sessionStorage 쓰기 병합", () => {
  let session: ReturnType<typeof makeStorage>;
  const docListeners: Record<string, () => void> = {};
  const winListeners: Record<string, () => void> = {};
  let visibility = "visible";

  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    session = makeStorage();
    const local = makeStorage();
    local.setItem("dibay:auth_bound_user_id", "user-a");
    vi.stubGlobal("sessionStorage", session);
    vi.stubGlobal("localStorage", local);
    vi.stubGlobal("window", {
      sessionStorage: session,
      localStorage: local,
      addEventListener: (t: string, f: () => void) => void (winListeners[t] = f),
    });
    vi.stubGlobal("document", {
      get visibilityState() {
        return visibility;
      },
      addEventListener: (t: string, f: () => void) => void (docListeners[t] = f),
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("첫 쓰기는 즉시, 창 안의 연속 쓰기는 창 끝에 마지막 값 1회", async () => {
    const m = await import("@/lib/community-messenger/bootstrap-cache");
    m.primeMessengerBootstrapFull(boot("user-a", 1));
    expect(session.setItem).toHaveBeenCalledTimes(1);
    for (let i = 2; i <= 50; i += 1) m.primeMessengerBootstrapFull(boot("user-a", i));
    expect(session.setItem).toHaveBeenCalledTimes(1);
    // 메모리는 즉시 최신
    expect((m.peekMessengerBootstrapFull() as unknown as { chats: unknown[] }).chats.length).toBe(50);
    vi.advanceTimersByTime(1_000);
    expect(session.setItem).toHaveBeenCalledTimes(2);
    const saved = JSON.parse(session.getItem(KEY)!) as { data: { chats: unknown[] } };
    expect(saved.data.chats.length).toBe(50);
  });

  it("서버 확인 값은 즉시 저장", async () => {
    const m = await import("@/lib/community-messenger/bootstrap-cache");
    m.primeMessengerBootstrapFull(boot("user-a", 1));
    m.primeMessengerBootstrapFull(boot("user-a", 2), { networkConfirmed: true });
    expect(session.setItem).toHaveBeenCalledTimes(2);
  });

  it("화면 숨김·pagehide 때 남은 쓰기를 즉시 저장", async () => {
    const m = await import("@/lib/community-messenger/bootstrap-cache");
    m.primeMessengerBootstrapFull(boot("user-a", 1));
    m.primeMessengerBootstrapFull(boot("user-a", 7));
    visibility = "hidden";
    docListeners.visibilitychange?.();
    const saved = JSON.parse(session.getItem(KEY)!) as { data: { chats: unknown[] } };
    expect(saved.data.chats.length).toBe(7);
    m.primeMessengerBootstrapFull(boot("user-a", 9));
    winListeners.pagehide?.();
    expect((JSON.parse(session.getItem(KEY)!) as { data: { chats: unknown[] } }).data.chats.length).toBe(9);
  });

  it("캐시 비우기(로그아웃)는 남은 쓰기를 취소 — 이전 사용자 목록이 다시 저장되지 않는다", async () => {
    const m = await import("@/lib/community-messenger/bootstrap-cache");
    m.primeMessengerBootstrapFull(boot("user-a", 1));
    m.primeMessengerBootstrapFull(boot("user-a", 3));
    m.clearBootstrapCache({ authExit: true });
    vi.advanceTimersByTime(5_000);
    expect(session.getItem(KEY)).toBeNull();
  });
});
