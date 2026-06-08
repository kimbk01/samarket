/**
 * 내 알림 목록 — 동시 요청 합류(runSingleFlight) + 짧은 TTL로 재진입·폴링 부하 완화.
 * 읽음 처리 직후 등은 `{ force: true }` 또는 `invalidateMeNotificationsListDedupedCache()` 로 최신화.
 */
import { forgetSingleFlightsWhere, runSingleFlight } from "@/lib/http/run-single-flight";

const TTL_MS = 20_000;

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

export function invalidateMeNotificationsListDedupedCache(): void {
  ttlCache.clear();
  forgetSingleFlightsWhere((k) => k.startsWith("me:notifications:list:"));
}

export type FetchMeNotificationsListOpts = {
  /** true면 TTL 무시·진행 중 비행 초기화 후 서버 재요청 */
  force?: boolean;
  /** true면 채팅 메시지(notification_type=chat)를 목록에서 제외 */
  excludeChatMessages?: boolean;
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
  } else {
    sp.set("exclude_owner_store_commerce", "1");
  }
  if (opts?.excludeChatMessages === true) {
    sp.set("exclude_chat_message", "1");
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
  if (force) {
    ttlCache.delete(url);
    forgetSingleFlightsWhere((k) => k === flightKey);
  }
  return runSingleFlight(flightKey, () =>
    fetch(url, { credentials: "include", cache: "no-store" })
  ).then(async (res): Promise<MeNotificationsListResult> => {
    const json: unknown = await res.clone().json().catch(() => ({}));
    const result = { status: res.status, json };
    if (res.ok || res.status === 401 || res.status === 503) {
      ttlCache.set(url, { value: result, expiresAt: Date.now() + TTL_MS });
    }
    return result;
  });
}
