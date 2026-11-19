import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetStoreProfileThumbnailCacheForTests,
  fetchStoreProfileThumbnailOnce,
  hasFreshStoreProfileThumbnailEntry,
  STORE_PROFILE_THUMB_NONE_TTL_MS,
} from "@/lib/community-messenger/delivery-chat-list/store-profile-thumbnail-cache";

/** 2026-11-19 — 주문 채팅 매장 썸네일 API 반복 호출 제거(운영 한산한 2시간 310회) */
const ok = (url: string | null) =>
  vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, url }) }) as unknown as Response);

describe("매장 썸네일 캐시", () => {
  beforeEach(() => __resetStoreProfileThumbnailCacheForTests());

  it("사진 있는 매장: 두 번째부터 요청 없음", async () => {
    const f = ok("https://x/p.jpg");
    expect(await fetchStoreProfileThumbnailOnce("s1", { fetchImpl: f })).toBe("https://x/p.jpg");
    expect(await fetchStoreProfileThumbnailOnce("s1", { fetchImpl: f })).toBe("https://x/p.jpg");
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("사진 없는 매장도 10분 기억 — 이전엔 매번 다시 불렀다", async () => {
    const f = ok(null);
    await fetchStoreProfileThumbnailOnce("s2", { fetchImpl: f });
    await fetchStoreProfileThumbnailOnce("s2", { fetchImpl: f });
    expect(f).toHaveBeenCalledTimes(1);
    expect(hasFreshStoreProfileThumbnailEntry("s2", Date.now() + STORE_PROFILE_THUMB_NONE_TTL_MS + 1)).toBe(false);
  });

  it("같은 순간 요청은 1개로 합친다(행 미리 받기 + 썸네일 마운트)", async () => {
    const f = ok("https://x/q.jpg");
    await Promise.all([fetchStoreProfileThumbnailOnce("s3", { fetchImpl: f }), fetchStoreProfileThumbnailOnce("s3", { fetchImpl: f })]);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("사진 로드 실패 시 force 는 기억이 있어도 다시 조회 · 네트워크 실패는 기억 안 함", async () => {
    const f = ok("https://x/r.jpg");
    await fetchStoreProfileThumbnailOnce("s4", { fetchImpl: f });
    await fetchStoreProfileThumbnailOnce("s4", { fetchImpl: f, force: true });
    expect(f).toHaveBeenCalledTimes(2);
    const boom = vi.fn(async () => {
      throw new Error("net");
    });
    expect(await fetchStoreProfileThumbnailOnce("s5", { fetchImpl: boom as never })).toBeNull();
    expect(hasFreshStoreProfileThumbnailEntry("s5")).toBe(false);
  });
});
