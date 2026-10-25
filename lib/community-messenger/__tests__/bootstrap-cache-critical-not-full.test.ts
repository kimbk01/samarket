import { describe, expect, it, beforeEach } from "vitest";
import {
  clearBootstrapCache,
  isBootstrapCacheFresh,
  peekBootstrapCache,
  primeBootstrapCache,
} from "@/lib/community-messenger/bootstrap-cache";
import type { CommunityMessengerBootstrap } from "@/lib/community-messenger/types";

/**
 * S-13 (1단계 문서 §14 · 2026-10-25 Samsung 실측): critical(상위 30방) 시드 데이터가 full 캐시로 저장되면
 * lite 요청이 캐시로 단락해 홈이 영구히 30방(보관 0·알림 끔 비활성)으로 남았다.
 */
function bootstrap(tier: "critical" | "full" | undefined, rooms: number): CommunityMessengerBootstrap {
  return {
    me: { id: "viewer-1" },
    chats: Array.from({ length: rooms }, (_, i) => ({ id: `room-${i}` })),
    groups: [],
    ...(tier ? { clientHydrationTier: tier } : {}),
  } as unknown as CommunityMessengerBootstrap;
}

describe("bootstrap cache — critical partial is never stored as full", () => {
  beforeEach(() => clearBootstrapCache());

  it("critical 시드 데이터는 full 캐시에 쓰지 않는다 (lite 가 네트워크로 전체 목록을 받게)", () => {
    primeBootstrapCache(bootstrap("critical", 30));
    expect(peekBootstrapCache()).toBeNull();
    expect(isBootstrapCacheFresh()).toBe(false);
  });

  it("full/lite 응답이 적용된 데이터는 full 캐시에 저장된다", () => {
    primeBootstrapCache(bootstrap("full", 275));
    expect(peekBootstrapCache()?.chats).toHaveLength(275);
    expect(isBootstrapCacheFresh()).toBe(true);
  });

  it("이미 full 캐시가 있을 때 critical 데이터가 덮어쓰지 않는다", () => {
    primeBootstrapCache(bootstrap("full", 275));
    primeBootstrapCache(bootstrap("critical", 30));
    expect(peekBootstrapCache()?.chats).toHaveLength(275);
  });
});
