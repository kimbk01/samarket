/**
 * 내 알림 목록 — 동시 요청 합류(runSingleFlight) + 짧은 TTL로 재진입·폴링 부하 완화.
 * 읽음 처리 직후 등은 `{ force: true }` 또는 `invalidateMeNotificationsListDedupedCache()` 로 최신화.
 */
import { forgetSingleFlight, runSingleFlight } from "@/lib/http/run-single-flight";

const URL_INCLUDE_CHAT = "/api/me/notifications?exclude_owner_store_commerce=1" as const;
const URL_EXCLUDE_CHAT =
  "/api/me/notifications?exclude_owner_store_commerce=1&exclude_chat_message=1" as const;
const FLIGHT_KEY_INCLUDE_CHAT = "me:notifications:list:exclude_owner_commerce" as const;
const FLIGHT_KEY_EXCLUDE_CHAT = "me:notifications:list:exclude_owner_commerce_no_chat" as const;
const TTL_MS = 20_000;

export type MeNotificationsListResult = {
  status: number;
  json: unknown;
};

let cachedIncludeChat: { expiresAt: number; value: MeNotificationsListResult } | null = null;
let cachedExcludeChat: { expiresAt: number; value: MeNotificationsListResult } | null = null;

export function invalidateMeNotificationsListDedupedCache(): void {
  cachedIncludeChat = null;
  cachedExcludeChat = null;
  forgetSingleFlight(FLIGHT_KEY_INCLUDE_CHAT);
  forgetSingleFlight(FLIGHT_KEY_EXCLUDE_CHAT);
}

export type FetchMeNotificationsListOpts = {
  /** true면 TTL 무시·진행 중 비행 초기화 후 서버 재요청 */
  force?: boolean;
  /** true면 채팅 메시지(notification_type=chat)를 목록에서 제외 */
  excludeChatMessages?: boolean;
};

export function fetchMeNotificationsListDeduped(
  opts?: FetchMeNotificationsListOpts
): Promise<MeNotificationsListResult> {
  const force = !!opts?.force;
  const excludeChatMessages = opts?.excludeChatMessages === true;
  const url = excludeChatMessages ? URL_EXCLUDE_CHAT : URL_INCLUDE_CHAT;
  const flightKey = excludeChatMessages ? FLIGHT_KEY_EXCLUDE_CHAT : FLIGHT_KEY_INCLUDE_CHAT;
  const cachedRef = excludeChatMessages ? cachedExcludeChat : cachedIncludeChat;
  const now = Date.now();
  if (!force && cachedRef && cachedRef.expiresAt > now) {
    return Promise.resolve(cachedRef.value);
  }
  if (force) {
    if (excludeChatMessages) {
      cachedExcludeChat = null;
    } else {
      cachedIncludeChat = null;
    }
    forgetSingleFlight(flightKey);
  }
  return runSingleFlight(flightKey, () =>
    fetch(url, { credentials: "include", cache: "no-store" })
  ).then(async (res): Promise<MeNotificationsListResult> => {
    const json: unknown = await res.clone().json().catch(() => ({}));
    const result = { status: res.status, json };
    if (res.ok || res.status === 401 || res.status === 503) {
      const next = { value: result, expiresAt: Date.now() + TTL_MS };
      if (excludeChatMessages) {
        cachedExcludeChat = next;
      } else {
        cachedIncludeChat = next;
      }
    }
    return result;
  });
}
