import type { CommunityMessengerFriendRequest } from "@/lib/community-messenger/types";

export type CommunityMessengerFriendRequestApiOk = {
  ok: true;
  request?: CommunityMessengerFriendRequest;
  mergedFromIncoming?: boolean;
  directRoomId?: string;
};

export type CommunityMessengerFriendRequestApiErr = {
  ok: false;
  error?: string;
  retryAfterMs?: number;
};

export type CommunityMessengerFriendRequestApiResult =
  | CommunityMessengerFriendRequestApiOk
  | CommunityMessengerFriendRequestApiErr;

const inflightByTarget = new Map<string, Promise<CommunityMessengerFriendRequestApiResult>>();

function trimId(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * 거절 쿨다운 등 — `retryAfterMs`(ms)를 사람이 읽기 쉬운 한국어로.
 */
/** 검색 행·칩용 짧은 표기 (남은 시간 기준 ms) */
export function formatFriendRejectCooldownShort(remainingMs: number): string {
  const ms = Math.max(0, remainingMs);
  const totalMin = Math.max(1, Math.ceil(ms / 60_000));
  if (totalMin >= 60 * 24 * 7) {
    const w = Math.floor(totalMin / (60 * 24 * 7));
    return `${Math.max(1, w)}주 후`;
  }
  if (totalMin >= 60 * 24) {
    const d = Math.ceil(totalMin / (60 * 24));
    return `${d}일 후`;
  }
  if (totalMin >= 60) {
    const h = Math.floor(totalMin / 60);
    const mm = totalMin % 60;
    return mm > 0 ? `${h}시간 ${mm}분 후` : `${h}시간 후`;
  }
  return `${totalMin}분 후`;
}

export function formatFriendRejectCooldownMessage(retryAfterMs: number): string {
  const m = Math.max(1, Math.ceil(retryAfterMs / 60_000));
  if (m >= 60 * 24) {
    const d = Math.ceil(m / (60 * 24));
    return `거절된 친구 요청은 ${d}일 후에 다시 보낼 수 있습니다.`;
  }
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const min = m % 60;
    return min > 0
      ? `거절된 친구 요청은 약 ${h}시간 ${min}분 후에 다시 보낼 수 있습니다.`
      : `거절된 친구 요청은 약 ${h}시간 후에 다시 보낼 수 있습니다.`;
  }
  return `거절된 친구 요청은 약 ${m}분 후에 다시 보낼 수 있습니다.`;
}

/** `busyId === …` 와 함께 쓰는 친구 요청 진행 토큰 */
export function messengerFriendRequestBusyId(userId: string): string {
  return `friend:${userId}`;
}

export function isMessengerFriendRequestBusy(busyId: string | null, userId: string): boolean {
  return busyId === messengerFriendRequestBusyId(userId);
}

/**
 * 친구 추가 검색 행·보낸 요청 목록의「요청 취소」.
 * 전송 중(`friend:${addresseeId}`)에도 낙관적 취소가 가능해야 하므로 막지 않는다.
 * 비활성: 동일 요청에 대한 취소 PATCH 진행 중(`request:${id}:cancel`)만.
 */
export function shouldDisableMessengerOutgoingFriendCancelButton(
  busyId: string | null,
  opts: { requestId: string; addresseeUserId?: string }
): boolean {
  if (!busyId) return false;
  if (busyId === "user-search") return false;
  const rid = String(opts.requestId ?? "").trim();
  return Boolean(rid && busyId === `request:${rid}:cancel`);
}

/** 수락/거절 — 동일 request PATCH 진행 중일 때만 비활성(다른 행·검색 busy 와 무관) */
export function shouldDisableMessengerIncomingFriendActionButtons(
  busyId: string | null,
  requestId: string
): boolean {
  if (!busyId) return false;
  const rid = String(requestId ?? "").trim();
  return Boolean(rid && busyId.startsWith(`request:${rid}:`));
}

const OPTIMISTIC_OUTGOING_PREFIX = "local:friend_request:";

/** `local:friend_request:${viewerId}:${addresseeId}` — 취소 시 서버 id 확보 전에도 상대 UUID 를 알 수 있다. */
export function parseOptimisticOutgoingFriendRequestId(
  requestId: string
): { viewerId: string; addresseeId: string } | null {
  const id = trimId(requestId);
  if (!id.startsWith(OPTIMISTIC_OUTGOING_PREFIX)) return null;
  const rest = id.slice(OPTIMISTIC_OUTGOING_PREFIX.length);
  const sep = rest.indexOf(":");
  if (sep <= 0 || sep >= rest.length - 1) return null;
  const viewerId = rest.slice(0, sep);
  const addresseeId = rest.slice(sep + 1);
  if (!viewerId || !addresseeId) return null;
  return { viewerId, addresseeId };
}

export async function postCancelOutgoingCommunityMessengerFriendRequestApi(addresseeId: string): Promise<{
  ok: boolean;
  didCancel?: boolean;
  error?: string;
}> {
  const target = trimId(addresseeId);
  if (!target) return { ok: false, error: "bad_target" };
  try {
    const res = await fetch("/api/community-messenger/friend-requests/cancel-outgoing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ addresseeId: target }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      didCancel?: boolean;
      error?: string;
    };
    if (res.ok && json.ok) return { ok: true, didCancel: json.didCancel === true };
    return { ok: false, error: typeof json.error === "string" ? json.error : undefined };
  } catch {
    return { ok: false, error: "network_error" };
  }
}

/**
 * 서버 `POST /api/community-messenger/friend-requests` 호출.
 * 동일 `targetUserId`에 대해 진행 중인 요청이 있으면 같은 Promise로 합류합니다(연속 탭·중복 제출 방지).
 */
export function postCommunityMessengerFriendRequestApi(
  targetUserId: string,
  note?: string
): Promise<CommunityMessengerFriendRequestApiResult> {
  const target = trimId(targetUserId);
  if (!target) return Promise.resolve({ ok: false, error: "bad_target" });

  const existing = inflightByTarget.get(target);
  if (existing) return existing;

  const p = (async (): Promise<CommunityMessengerFriendRequestApiResult> => {
    try {
      const res = await fetch("/api/community-messenger/friend-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId: target, note }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        mergedFromIncoming?: boolean;
        directRoomId?: string;
        request?: CommunityMessengerFriendRequest;
        retryAfterMs?: number;
      };
      if (res.ok && json.ok) {
        return {
          ok: true,
          request: json.request,
          mergedFromIncoming: json.mergedFromIncoming,
          directRoomId: json.directRoomId,
        };
      }
      return {
        ok: false,
        error: typeof json.error === "string" ? json.error : undefined,
        retryAfterMs: typeof json.retryAfterMs === "number" ? json.retryAfterMs : undefined,
      };
    } catch {
      return { ok: false, error: "network_error" };
    }
  })();

  inflightByTarget.set(target, p);
  void p.finally(() => {
    inflightByTarget.delete(target);
  });

  return p;
}

/**
 * 스낵바 등에 쓸 사용자 메시지. 조용히 무시할 때는 `null`.
 */
export function communityMessengerFriendRequestFailureMessage(
  result: CommunityMessengerFriendRequestApiResult
): string | null {
  if (result.ok) return null;
  const err = result.error ?? "";
  if (err === "reject_cooldown_active" && typeof result.retryAfterMs === "number") {
    return formatFriendRejectCooldownMessage(result.retryAfterMs);
  }
  switch (err) {
    case "blocked_target":
      return "차단 상태에서는 친구 요청을 보낼 수 없습니다.";
    case "already_friend":
      return "이미 친구입니다.";
    case "already_requested":
      return "이미 친구 요청을 보냈습니다.";
    case "incoming_request_exists":
      return "상대가 보낸 요청이 있습니다. 알림에서 수락할 수 있습니다.";
    case "bad_target":
      return "요청을 보낼 수 없습니다.";
    case "network_error":
      return "네트워크 오류로 요청을 보내지 못했습니다.";
    default:
      return "친구 요청을 보낼 수 없습니다. 잠시 후 다시 시도해 주세요.";
  }
}
