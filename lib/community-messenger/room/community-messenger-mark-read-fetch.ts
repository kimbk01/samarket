/**
 * PATCH mark_read 단일 계약 — 세션 쿠키·flushOpen(open RPC 모드) 고정.
 * @see app/api/community-messenger/rooms/[roomId]/route.ts
 *
 * After server ACK: OS tray for that room must recompute/remove (not list-open).
 */
import { removeDeliveredNotificationsForRoomRead } from "@/lib/push/native/remove-delivered-notifications";
/** 실패 로그용 본문 미리보기 상한 — JSON 해석에는 쓰지 않는다 */
export const COMMUNITY_MESSENGER_MARK_READ_PREVIEW_MAX = 2048;

export type CommunityMessengerMarkReadPatchBody =
  | { action: "mark_read"; flushOpen: true }
  | { action: "mark_read"; flushOpen: true; lastReadMessageId: string };

export function buildCommunityMessengerMarkReadPatchBody(
  lastReadMessageId?: string | null
): CommunityMessengerMarkReadPatchBody {
  const mid = typeof lastReadMessageId === "string" ? lastReadMessageId.trim() : "";
  if (mid) return { action: "mark_read", flushOpen: true, lastReadMessageId: mid };
  return { action: "mark_read", flushOpen: true };
}

export const communityMessengerMarkReadFetchInitBase: Pick<RequestInit, "method" | "credentials" | "headers"> = {
  method: "PATCH",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
};

/** 응답 본문 문자열(실패 디버그용, 상한) */
export async function readCommunityMessengerMarkReadResponseBodyPreview(
  res: Response,
  maxLen = COMMUNITY_MESSENGER_MARK_READ_PREVIEW_MAX
): Promise<string> {
  try {
    const t = await res.text();
    if (t.length <= maxLen) return t;
    return `${t.slice(0, maxLen)}…`;
  } catch {
    return "";
  }
}

export type CommunityMessengerMarkReadJson = {
  ok?: boolean;
  lastReadMessageId?: string | null;
  error?: string;
  /** B2 — atomic mark 후 POST room-read 생략 지시 */
  roomReadFollowUp?: "skip" | "required";
  /** P3-a Domain badge snapshot (Generation Owner on PATCH) */
  badgeAck?: Record<string, unknown>;
};

/**
 * `res.json()` 대신 단일 text 읽기 — 본문 전체를 해석하고, 로그용 미리보기만 자른다.
 * 2026-11-19 결함: 미리보기(2048자)를 그대로 JSON.parse 해서, 성공 응답의 `badgeAck`(안 읽은 방 ID 목록 포함)가
 * 2048자를 넘으면 해석 실패 → `ok` 없음 → 서버는 읽음 처리했는데 클라가 실패로 보고 안 읽음 숫자를 되돌렸다
 * (목록 「모두 읽음」 「일부 채팅을 읽음으로 바꾸지 못했어요」, 고객 주문 채팅 안 읽음 약 10방 이상).
 */
export async function parseCommunityMessengerMarkReadResponse(res: Response): Promise<{
  okHttp: boolean;
  status: number;
  json: CommunityMessengerMarkReadJson;
  rawPreview: string;
}> {
  let raw = "";
  try {
    raw = await res.text();
  } catch {
    raw = "";
  }
  let json: CommunityMessengerMarkReadJson = {};
  if (raw) {
    try {
      json = JSON.parse(raw) as CommunityMessengerMarkReadJson;
    } catch {
      json = {};
    }
  }
  const rawPreview =
    raw.length <= COMMUNITY_MESSENGER_MARK_READ_PREVIEW_MAX
      ? raw
      : `${raw.slice(0, COMMUNITY_MESSENGER_MARK_READ_PREVIEW_MAX)}…`;
  return { okHttp: res.ok, status: res.status, json, rawPreview };
}

/** Call only after mark_read HTTP ACK ok — never on list open / optimistic UI. */
export function afterCommunityMessengerMarkReadAck(input: {
  roomId: string;
  domain?: string | null;
  domainIdentityKey?: string | null;
}): void {
  const roomId = String(input.roomId ?? "").trim();
  if (!roomId) return;
  void removeDeliveredNotificationsForRoomRead({
    roomId,
    domain: input.domain ?? null,
    domainIdentityKey: input.domainIdentityKey ?? null,
  });
}
