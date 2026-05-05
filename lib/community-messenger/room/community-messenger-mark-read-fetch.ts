/**
 * PATCH mark_read 단일 계약 — 세션 쿠키·flushOpen(open RPC 모드) 고정.
 * @see app/api/community-messenger/rooms/[roomId]/route.ts
 */
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
export async function readCommunityMessengerMarkReadResponseBodyPreview(res: Response, maxLen = 2048): Promise<string> {
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
};

/** `res.json()` 대신 단일 text 읽기 — 실패 시 본문 로그용 */
export async function parseCommunityMessengerMarkReadResponse(res: Response): Promise<{
  okHttp: boolean;
  status: number;
  json: CommunityMessengerMarkReadJson;
  rawPreview: string;
}> {
  const rawPreview = await readCommunityMessengerMarkReadResponseBodyPreview(res);
  let json: CommunityMessengerMarkReadJson = {};
  if (rawPreview) {
    try {
      json = JSON.parse(rawPreview) as CommunityMessengerMarkReadJson;
    } catch {
      json = {};
    }
  }
  return { okHttp: res.ok, status: res.status, json, rawPreview };
}
