// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CM_NOTIFICATION_DISMISSED_IDS_KEY,
  DEVICE_STORAGE_CLEANUP_INTERVAL_MS,
  DEVICE_STORAGE_CLEANUP_LAST_RUN_KEY,
  runDeviceStorageAutoCleanupDaily,
  runDeviceStorageCleanupNow,
} from "@/lib/storage/device-storage-auto-cleanup.client";
import { selectRoomSnapshotEvictions } from "@/lib/community-messenger/local-store/roomSnapshotDb";
import { isClearableLocalCacheKey } from "@/lib/mypage/clear-app-client-caches";

/**
 * 기기 저장공간 S1 (2026-11-19) — 근거: docs/audit/device-storage-legacy-design-2026-11-19.md
 */
const NOW = 1_800_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

describe("하루 1회 자동 정리 — 누수 3종만, 나머지는 보존", () => {
  beforeEach(() => localStorage.clear());

  it("만료·손상된 거래 목록 사본만 지우고 유효한 사본은 남긴다", () => {
    localStorage.setItem("samarket:home-posts:local:v1:a", JSON.stringify({ expiresAt: NOW - 1, data: {} }));
    localStorage.setItem("samarket:home-posts:local:v1:b", "not-json");
    localStorage.setItem("samarket:home-posts:local:v1:c", JSON.stringify({ expiresAt: NOW + 1000, data: {} }));
    const r = runDeviceStorageCleanupNow(localStorage, NOW);
    expect(r.homePostsRemoved).toBe(2);
    expect(localStorage.getItem("samarket:home-posts:local:v1:c")).not.toBeNull();
  });

  it("가격 제안 신호 키는 7일 지난 것만 지운다", () => {
    localStorage.setItem("samarket:price-offers-bump:old", String(NOW - 8 * DAY));
    localStorage.setItem("samarket:price-offers-bump:new", String(NOW - DAY));
    localStorage.setItem("samarket:price-offers-bump:bad", "x");
    const r = runDeviceStorageCleanupNow(localStorage, NOW);
    expect(r.offerBumpsRemoved).toBe(2);
    expect(localStorage.getItem("samarket:price-offers-bump:new")).not.toBeNull();
  });

  it("닫은 알림 id 는 최근 500개만 남긴다(뒤쪽이 최근)", () => {
    const ids = Array.from({ length: 620 }, (_, i) => `n${i}`);
    localStorage.setItem(CM_NOTIFICATION_DISMISSED_IDS_KEY, JSON.stringify(ids));
    const r = runDeviceStorageCleanupNow(localStorage, NOW);
    expect(r.dismissedIdsTrimmed).toBe(120);
    const kept = JSON.parse(localStorage.getItem(CM_NOTIFICATION_DISMISSED_IDS_KEY)!) as string[];
    expect(kept.length).toBe(500);
    expect(kept[0]).toBe("n120");
    expect(kept[499]).toBe("n619");
  });

  it("로그인·설정·초안·장바구니 등 다른 키는 건드리지 않는다", () => {
    const keep: Record<string, string> = {
      "sb-proj-auth-token": "t",
      "samarket:app-language": "ko",
      "samarket:trade-write-form-local": "{}",
      kasama_store_commerce_cart_v1: "{}",
      "dibay:cm-contacts:v1:u1": "[]",
      "philife:post-saved:p1": "1",
    };
    for (const [k, v] of Object.entries(keep)) localStorage.setItem(k, v);
    runDeviceStorageCleanupNow(localStorage, NOW);
    for (const [k, v] of Object.entries(keep)) expect(localStorage.getItem(k)).toBe(v);
  });

  it("하루에 한 번만 실행한다", () => {
    const a = runDeviceStorageAutoCleanupDaily(NOW);
    const b = runDeviceStorageAutoCleanupDaily(NOW + 1000);
    const c = runDeviceStorageAutoCleanupDaily(NOW + DEVICE_STORAGE_CLEANUP_INTERVAL_MS);
    expect([a.ran, b.ran, c.ran]).toEqual([true, false, true]);
    expect(localStorage.getItem(DEVICE_STORAGE_CLEANUP_LAST_RUN_KEY)).toBe(String(NOW + DEVICE_STORAGE_CLEANUP_INTERVAL_MS));
  });
});

describe("채팅방 사본 — 개수·전체 크기 상한, 오래 안 연 방부터", () => {
  it("전체 크기 상한을 넘으면 오래 안 연 방부터 지운다", () => {
    const rows = [
      { roomId: "old", lastAccessAt: 1, chars: 6 },
      { roomId: "mid", lastAccessAt: 2, chars: 6 },
      { roomId: "new", lastAccessAt: 3, chars: 6 },
    ];
    expect(selectRoomSnapshotEvictions(rows, { maxRooms: 10, maxTotalChars: 12 })).toEqual(["old"]);
  });
  it("개수 상한을 넘으면 오래 안 연 방부터 지운다", () => {
    const rows = [
      { roomId: "a", lastAccessAt: 5, chars: 1 },
      { roomId: "b", lastAccessAt: 1, chars: 1 },
      { roomId: "c", lastAccessAt: 3, chars: 1 },
    ];
    expect(selectRoomSnapshotEvictions(rows, { maxRooms: 2, maxTotalChars: 100 })).toEqual(["b"]);
  });
});

describe("임시 데이터 삭제 범위 확대", () => {
  it("거래 목록 사본·인트로 색인은 지우는 대상, 로그인·초안은 아님", () => {
    expect(isClearableLocalCacheKey("samarket:home-posts:local:v1:abc")).toBe(true);
    expect(isClearableLocalCacheKey("dibay:launch-intro:index")).toBe(true);
    expect(isClearableLocalCacheKey("sb-proj-auth-token")).toBe(false);
    expect(isClearableLocalCacheKey("samarket:trade-write-form-local")).toBe(false);
  });

  it("버튼은 채팅방 사본(IndexedDB)도 지운다", async () => {
    vi.resetModules();
    const clearRooms = vi.fn(async () => {});
    vi.doMock("@/lib/community-messenger/local-store/roomSnapshotDb", () => ({
      clearAllLocalRoomSnapshots: clearRooms,
    }));
    vi.doMock("@/lib/auth/invalidate-auth-exit-client-caches", () => ({
      clearBrowserCacheStorageBestEffort: async () => {},
    }));
    const { clearAppClientCaches } = await import("@/lib/mypage/clear-app-client-caches");
    await clearAppClientCaches();
    expect(clearRooms).toHaveBeenCalledTimes(1);
  });
});
