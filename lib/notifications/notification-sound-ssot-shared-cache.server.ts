import { revalidateTag, unstable_cache } from "next/cache";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import {
  mergeNotificationSoundSsotForAdmin,
  type NotificationSoundSsotMergedPayload,
} from "@/lib/notifications/load-notification-sound-ssot-server";
import type {
  NotificationSoundAssetRow,
  NotificationSoundEventRow,
  NotificationSoundMappingRow,
} from "@/lib/notifications/notification-sound-types";

/**
 * 2026-11-26 D6 — 앱 알림음 설정(`GET /api/app/notification-sound-ssot`) 서버 인스턴스 공유 캐시.
 * 설계: docs/audit/supabase-request-surge-2026-11-18/budget-alert-final-2026-11-26.md §1-D6 · §2-A
 *
 * 운영 실측(11-25): 요청 90 중 82(91%)가 표 3개를 다시 읽음 — 기존 캐시는 인스턴스 메모리 60초인데 요청 간격이 평균 16분.
 * → Next Data Cache(인스턴스 공유, 동네 피드 고정값 `philife-feed-shared-config-cache.server.ts` 와 같은 방식).
 * - 읽기 실패는 캐시하지 않는다(throw → 호출부가 기존 `loadNotificationSoundSsotCached`).
 * - 관리자 소리 저장·업로드가 태그를 즉시 만료(모든 인스턴스). 자연 만료 1시간 — 요청 간격(평균 16분)보다 길어야 캐시가 맞는다.
 *   표를 바꾸는 곳은 관리자 저장·업로드 두 라우트뿐(둘 다 만료 호출).
 * - 푸시 발송·통화 소리 설정 경로(`loadNotificationSoundSsotCached`)는 바꾸지 않는다.
 */
export const NOTIFICATION_SOUND_SSOT_CACHE_TAG = "notification-sound-ssot";
export const NOTIFICATION_SOUND_SSOT_REVALIDATE_SEC = 3600;

export const loadNotificationSoundSsotShared = unstable_cache(
  async (): Promise<NotificationSoundSsotMergedPayload> => {
    const sb = getSupabaseServer();
    const [assetsRes, eventsRes, mappingsRes] = await Promise.all([
      sb.from("notification_sound_assets").select("*"),
      sb.from("notification_sound_events").select("*"),
      sb.from("notification_sound_mappings").select("*"),
    ]);
    const err = assetsRes.error ?? eventsRes.error ?? mappingsRes.error;
    if (err) throw new Error(err.message || "notification_sound_ssot_failed");
    return mergeNotificationSoundSsotForAdmin({
      assets: (assetsRes.data ?? []) as NotificationSoundAssetRow[],
      events: (eventsRes.data ?? []) as NotificationSoundEventRow[],
      mappings: (mappingsRes.data ?? []) as NotificationSoundMappingRow[],
    });
  },
  ["notification-sound-ssot-rows:v1"],
  { revalidate: NOTIFICATION_SOUND_SSOT_REVALIDATE_SEC, tags: [NOTIFICATION_SOUND_SSOT_CACHE_TAG] }
);

export function invalidateNotificationSoundSsotSharedCache(): void {
  try {
    revalidateTag(NOTIFICATION_SOUND_SSOT_CACHE_TAG, { expire: 0 });
  } catch {
    /* 요청 밖(스크립트·테스트) — 자연 만료 */
  }
}
