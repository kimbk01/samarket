import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearBootstrapCache,
  getBootstrapCacheNetworkConfirmedAgeMs,
  isBootstrapCacheFresh,
  primeBootstrapCache,
  primeMessengerBootstrapCritical,
} from "@/lib/community-messenger/bootstrap-cache";
import type { CommunityMessengerBootstrap, CommunityMessengerBootstrapCritical } from "@/lib/community-messenger/types";

/** 1단계 결함 D-7 W1 (2026-10-26): 서버로 확인한 시각을 로컬 부분 갱신과 분리. */

const boot = (lastMessage: string) =>
  ({ me: null, chats: [{ id: "c202326f", lastMessage }], groups: [] }) as unknown as CommunityMessengerBootstrap;

describe("D-7 W1 서버 확인 시각", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-26T04:59:00Z"));
    clearBootstrapCache();
  });
  afterEach(() => vi.useRealTimers());

  it("서버 응답 기록만 확인 시각을 갱신, 로컬 부분 갱신은 유지", () => {
    expect(getBootstrapCacheNetworkConfirmedAgeMs()).toBeNull();
    primeBootstrapCache(boot("새 메시지"), { networkConfirmed: true });
    vi.advanceTimersByTime(13 * 60_000);
    primeBootstrapCache(boot("새 메시지")); // 안 읽음 수 등 로컬 패치
    expect(isBootstrapCacheFresh()).toBe(true); // 기존 의미는 그대로(기록 시각 기준)
    expect(getBootstrapCacheNetworkConfirmedAgeMs()).toBe(13 * 60_000); // 서버 확인은 13분 전
    primeBootstrapCache(boot("음성 통화 · 11s"), { networkConfirmed: true });
    expect(getBootstrapCacheNetworkConfirmedAgeMs()).toBe(0);
  });

  it("critical 서버 응답도 확인 시각 갱신 · 캐시 비우면 초기화", () => {
    primeMessengerBootstrapCritical({ chats: [], groups: [] } as unknown as CommunityMessengerBootstrapCritical, {
      networkConfirmed: true,
    });
    expect(getBootstrapCacheNetworkConfirmedAgeMs()).toBe(0);
    clearBootstrapCache();
    expect(getBootstrapCacheNetworkConfirmedAgeMs()).toBeNull();
  });

  it("서버 응답 기록 지점 6곳이 networkConfirmed 를 넘김 (계약)", () => {
    const home = readFileSync(join(process.cwd(), "lib/community-messenger/home/use-community-messenger-home-bootstrap.ts"), "utf8");
    const warm = readFileSync(join(process.cwd(), "lib/community-messenger/warm-messenger-list-bootstrap-client.ts"), "utf8");
    expect(home.split("networkConfirmed: true").length - 1).toBe(4);
    expect(warm.split("networkConfirmed: true").length - 1).toBe(2);
  });
});
