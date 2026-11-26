/**
 * 2026-11-26 D6 — 앱 알림음 설정 인스턴스 공유 캐시.
 * 설계: docs/audit/supabase-request-surge-2026-11-18/budget-alert-final-2026-11-26.md §2-A
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidateTag = vi.fn();
/** 테스트에서는 캐시 없이 함수를 그대로 부른다(공유 캐시 동작은 Next 가 책임) */
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
  revalidateTag: (...a: unknown[]) => revalidateTag(...a),
}));

const sharedFrom = vi.fn();
vi.mock("@/lib/chat/supabase-server", () => ({
  getSupabaseServer: () => ({ from: sharedFrom }),
}));

import {
  NOTIFICATION_SOUND_SSOT_CACHE_TAG,
  NOTIFICATION_SOUND_SSOT_REVALIDATE_SEC,
  invalidateNotificationSoundSsotSharedCache,
  loadNotificationSoundSsotShared,
} from "@/lib/notifications/notification-sound-ssot-shared-cache.server";
import { mergeNotificationSoundSsotForAdmin } from "@/lib/notifications/load-notification-sound-ssot-server";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

function tables(result: Record<string, { data: unknown; error: unknown }>) {
  sharedFrom.mockImplementation((t: string) => ({ select: async () => result[t] }));
}

beforeEach(() => {
  sharedFrom.mockReset();
  revalidateTag.mockReset();
});

describe("loadNotificationSoundSsotShared", () => {
  it("표 3개를 읽어 기존과 같은 병합 결과", async () => {
    tables({
      notification_sound_assets: { data: [], error: null },
      notification_sound_events: { data: [], error: null },
      notification_sound_mappings: { data: [], error: null },
    });
    expect(await loadNotificationSoundSsotShared()).toEqual(mergeNotificationSoundSsotForAdmin({}));
    expect(sharedFrom.mock.calls.map((c) => c[0]).sort()).toEqual([
      "notification_sound_assets",
      "notification_sound_events",
      "notification_sound_mappings",
    ]);
  });

  it("한 표라도 오류 → 던진다(캐시하지 않음 · 호출부가 기존 경로)", async () => {
    tables({
      notification_sound_assets: { data: [], error: null },
      notification_sound_events: { data: null, error: { message: "boom" } },
      notification_sound_mappings: { data: [], error: null },
    });
    await expect(loadNotificationSoundSsotShared()).rejects.toThrow("boom");
  });

  it("만료 = 태그 즉시 만료 · 자연 만료 1시간", () => {
    invalidateNotificationSoundSsotSharedCache();
    expect(revalidateTag).toHaveBeenCalledWith(NOTIFICATION_SOUND_SSOT_CACHE_TAG, { expire: 0 });
    expect(NOTIFICATION_SOUND_SSOT_REVALIDATE_SEC).toBe(3600);
  });
});

describe("연결 계약", () => {
  it("앱 라우트는 공유 캐시 먼저, 실패 시 기존 경로", () => {
    const src = read("app/api/app/notification-sound-ssot/route.ts");
    expect(src).toContain("loadNotificationSoundSsotShared().catch(() =>");
    expect(src).toContain("loadNotificationSoundSsotCached(getSupabaseServer())");
  });

  it("표를 바꾸는 관리자 저장·업로드가 공유 캐시를 만료", () => {
    for (const p of [
      "app/api/admin/notification-sound-ssot/route.ts",
      "app/api/admin/notification-sound-ssot/upload/route.ts",
    ]) {
      expect(read(p)).toContain("invalidateNotificationSoundSsotSharedCache();");
    }
  });

  it("푸시 발송·통화 소리 설정 경로는 공유 캐시를 쓰지 않는다", () => {
    for (const p of [
      "lib/notifications/notification-sound-ssot-server-hydrate.ts",
      "app/api/app/messenger-call-sound-config/route.ts",
      "app/api/app/notification-sound-resolve/route.ts",
    ]) {
      expect(read(p)).not.toContain("notification-sound-ssot-shared-cache");
    }
  });
});
