/**
 * 내 알림 목록 — 동시 요청 합류(runSingleFlight) + 짧은 TTL로 재진입·폴링 부하 완화.
 * 읽음 처리 직후 등은 `{ force: true }` 또는 `invalidateMeNotificationsListDedupedCache()` 로 최신화.
 */
import { resolveClientAuthenticatedUserIdForFetch } from "@/lib/auth/resolve-client-authenticated-user-id-for-fetch";
import { getSyncViewerUserIdForClient } from "@/lib/auth/get-current-user";
import { forgetSingleFlightsWhere, runSingleFlight } from "@/lib/http/run-single-flight";

const TTL_MS = 20_000;
const UNAUTHORIZED_BACKOFF_MS = 30_000;

export type MeNotificationsListResult = {
  status: number;
  json: unknown;
};

export type InboxPushKindFilter =
  | "all"
  | "chat"
  | "trade"
  | "delivery"
  | "community"
  | "notice"
  | "marketing"
  | "system";

const ttlCache = new Map<string, { expiresAt: number; value: MeNotificationsListResult }>();

/** 세션 없음·401 backoff 시 네트워크 없이 반환 — 호출부 401 분기와 동일 */
export const ME_NOTIFICATIONS_EMPTY_UNAUTHENTICATED: MeNotificationsListResult = {
  status: 401,
  json: { ok: false, notifications: [] },
};

/** 로그아웃·계정 전환 직후 — invalidate 와 별도로 fetch 차단 유지 */
let authExitPaused = false;
/** 서버 401 직후 `force` 포함 재시도 억제 */
let unauthorizedUntil = 0;

function isFetchBlocked(now = Date.now()): boolean {
  if (authExitPaused) return true;
  return unauthorizedUntil > now;
}

function markUnauthorizedBackoff(now = Date.now()): void {
  unauthorizedUntil = now + UNAUTHORIZED_BACKOFF_MS;
}

function clearAuthFetchBlocksIfSession(userId: string | null): void {
  if (!userId) return;
  authExitPaused = false;
  unauthorizedUntil = 0;
}

function cacheUnauthenticatedResult(url: string, now = Date.now()): MeNotificationsListResult {
  ttlCache.set(url, { value: ME_NOTIFICATIONS_EMPTY_UNAUTHENTICATED, expiresAt: now + TTL_MS });
  return ME_NOTIFICATIONS_EMPTY_UNAUTHENTICATED;
}

export function invalidateMeNotificationsListDedupedCache(): void {
  ttlCache.clear();
  forgetSingleFlightsWhere((k) => k.startsWith("me:notifications:list:"));
}

/** 로그아웃·계정 전환 — TTL 삭제 + 비로그인 즉시 401 네트워크 방지 */
export function pauseMeNotificationsListDedupedAfterAuthExit(): void {
  authExitPaused = true;
  ttlCache.clear();
  forgetSingleFlightsWhere((k) => k.startsWith("me:notifications:list:"));
}

export type FetchMeNotificationsListOpts = {
  /** true면 TTL 무시·진행 중 비행 초기화 후 서버 재요청 */
  force?: boolean;
  /** true면 채팅 메시지(notification_type=chat)를 목록에서 제외 */
  excludeChatMessages?: boolean;
  /**
   * true면 오너 매장 커머스 알림 제외.
   * Header Bell / My Notifications 전체 Inbox는 기본 false — digit(notification_events)과 list 일치.
   * 소비자-only 표면이 필요할 때만 명시.
   */
  excludeOwnerStoreCommerce?: boolean;
  /**
   * true면 missed_call 행을 목록에서 제외 (B axis — Member Bell A_member list).
   * Digit builder와 별개; call log / RoomUnread 미개봉.
   */
  excludeMissedCalls?: boolean;
  /** 인박스 종류 필터 (서버 push_kind·채팅 병합 쿼리) */
  pushKind?: InboxPushKindFilter;
  /** 페이지 크기 1–100, 지정 시 서버에 limit·offset 전달 */
  limit?: number;
  /** 페이지 시작 오프셋 */
  offset?: number;
  /** 오너 매장 알림 목록 — `owner_store_id` 쿼리 */
  ownerStoreId?: string;
};

function buildNotificationsListUrl(opts?: FetchMeNotificationsListOpts): string {
  const sp = new URLSearchParams();
  const ownerSid = opts?.ownerStoreId?.trim();
  if (ownerSid) {
    sp.set("owner_store_id", ownerSid);
  } else if (opts?.excludeOwnerStoreCommerce === true) {
    sp.set("exclude_owner_store_commerce", "1");
  }
  if (opts?.excludeChatMessages === true) {
    sp.set("exclude_chat_message", "1");
  }
  if (opts?.excludeMissedCalls === true) {
    sp.set("exclude_missed_call", "1");
  }
  const pk = opts?.pushKind;
  if (pk && pk !== "all") {
    sp.set("push_kind", pk);
  }
  if (opts?.limit != null && Number.isFinite(opts.limit) && opts.limit > 0) {
    sp.set("limit", String(Math.min(Math.floor(opts.limit), 100)));
    sp.set("offset", String(Math.max(0, Math.floor(opts.offset ?? 0))));
  }
  return `/api/me/notifications?${sp.toString()}`;
}

export function fetchMeNotificationsListDeduped(
  opts?: FetchMeNotificationsListOpts
): Promise<MeNotificationsListResult> {
  const force = !!opts?.force;
  const url = buildNotificationsListUrl(opts);
  const flightKey = `me:notifications:list:${url}`;
  const now = Date.now();
  const cached = ttlCache.get(url);
  if (!force && cached && cached.expiresAt > now) {
    return Promise.resolve(cached.value);
  }
  clearAuthFetchBlocksIfSession(getSyncViewerUserIdForClient() ?? null);
  if (isFetchBlocked(now)) {
    return Promise.resolve(cached?.value ?? ME_NOTIFICATIONS_EMPTY_UNAUTHENTICATED);
  }
  if (force) {
    ttlCache.delete(url);
    forgetSingleFlightsWhere((k) => k === flightKey);
  }
  return runSingleFlight(flightKey, async () => {
    const userId = await resolveClientAuthenticatedUserIdForFetch();
    clearAuthFetchBlocksIfSession(userId);
    if (!userId) {
      return cacheUnauthenticatedResult(url, Date.now());
    }
    if (isFetchBlocked()) {
      return ttlCache.get(url)?.value ?? ME_NOTIFICATIONS_EMPTY_UNAUTHENTICATED;
    }

    const res = await fetch(url, { credentials: "include", cache: "no-store" });
    const json: unknown = await res.clone().json().catch(() => ({}));
    const result = { status: res.status, json };
    if (res.status === 401) {
      markUnauthorizedBackoff();
      authExitPaused = false;
      ttlCache.set(url, { value: result, expiresAt: Date.now() + TTL_MS });
      return result;
    }
    if (res.ok || res.status === 503) {
      ttlCache.set(url, { value: result, expiresAt: Date.now() + TTL_MS });
    }
    return result;
  });
}

/** vitest — 모듈 singleton 초기화 */
export function resetMeNotificationsListDedupedClientForTests(): void {
  ttlCache.clear();
  forgetSingleFlightsWhere((k) => k.startsWith("me:notifications:list:"));
  authExitPaused = false;
  unauthorizedUntil = 0;
}
