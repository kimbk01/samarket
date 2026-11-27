/**
 * 통화 푸시·부재중 알림 문구 언어 (받는 사람 기준) — 서버 전용.
 * 순서는 `loadNotificationUserLanguage` 와 같다(계정 명시값 → 최근 기기 앱 언어 → en).
 * 한 통화의 수신·종료·부재중 푸시가 같은 사람을 몇 초 안에 여러 번 찾으므로 인스턴스 메모리에 5분 둔다.
 *
 * 통화 신호(수신·취소·다른 기기에서 받음) 발송은 이 조회를 **기다리지 않는다** — `resolveCallPushLanguageNoWait`:
 * 캐시가 있으면 그 언어, 없으면 null(호출처는 예전 한국어 문구로 즉시 발송)을 돌려주고 조회는 뒤에서 캐시만 채운다.
 * 계획: docs/audit/i18n-call-copy-plan-2026-11-27.md §2-3·§2-4
 */
import { FALLBACK_APP_LANGUAGE, type AppLanguageCode } from "@/lib/i18n/config";
import { loadNotificationUserLanguage } from "@/lib/notifications/notification-user-language";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

const CACHE_TTL_MS = 5 * 60_000;
const CACHE_MAX = 500;
const cache = new Map<string, { language: AppLanguageCode; at: number }>();
const inFlight = new Map<string, Promise<AppLanguageCode>>();

function normalizeUserId(userId: string): string {
  return String(userId ?? "").trim().toLowerCase();
}

/** 캐시만 본다(조회 없음). 없거나 만료면 null. */
export function peekCallPushRecipientLanguage(userId: string): AppLanguageCode | null {
  const uid = normalizeUserId(userId);
  if (!uid) return null;
  const hit = cache.get(uid);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.language;
  return null;
}

/** 조회해서 캐시를 채운다(같은 사람 동시 조회는 1번). throw 없음. 부재중 알림처럼 기다려도 되는 곳만 await 한다. */
export async function loadCallPushRecipientLanguage(userId: string): Promise<AppLanguageCode> {
  const uid = normalizeUserId(userId);
  if (!uid) return FALLBACK_APP_LANGUAGE;
  const cached = peekCallPushRecipientLanguage(uid);
  if (cached) return cached;
  const running = inFlight.get(uid);
  if (running) return running;
  const p = (async (): Promise<AppLanguageCode> => {
    try {
      const sb = tryCreateSupabaseServiceClient();
      if (!sb) return FALLBACK_APP_LANGUAGE;
      const language = await loadNotificationUserLanguage(sb, uid);
      cache.delete(uid);
      cache.set(uid, { language, at: Date.now() });
      while (cache.size > CACHE_MAX) {
        const oldest = cache.keys().next().value;
        if (oldest === undefined) break;
        cache.delete(oldest);
      }
      return language;
    } catch {
      return FALLBACK_APP_LANGUAGE;
    } finally {
      inFlight.delete(uid);
    }
  })();
  inFlight.set(uid, p);
  return p;
}

/** 뒤에서 캐시만 채운다(기다리지 않음, 오류 삼킴). */
export function warmCallPushRecipientLanguage(userId: string): void {
  if (!normalizeUserId(userId)) return;
  void loadCallPushRecipientLanguage(userId).catch(() => undefined);
}

/**
 * 통화 신호용 — 기다리지 않는다. 캐시 적중이면 그 언어, 아니면 null 을 돌려주고 뒤에서 캐시를 데운다.
 * null 이면 호출처는 예전(변경 전) 문구로 즉시 보낸다.
 */
export function resolveCallPushLanguageNoWait(userId: string): AppLanguageCode | null {
  const hit = peekCallPushRecipientLanguage(userId);
  if (hit) return hit;
  warmCallPushRecipientLanguage(userId);
  return null;
}

/** 캐시가 없을 때 쓰는 예전(변경 전) 문구 언어 — 변경 전 통화 신호 문구는 모두 한국어였다. */
export const CALL_SIGNAL_LEGACY_COPY_LANGUAGE: AppLanguageCode = "ko";

/** 시험 전용 */
export function __resetCallPushRecipientLanguageCacheForTests(): void {
  cache.clear();
  inFlight.clear();
}

/** 시험 전용 */
export function __setCallPushRecipientLanguageCacheForTests(userId: string, language: AppLanguageCode): void {
  cache.set(normalizeUserId(userId), { language, at: Date.now() });
}
