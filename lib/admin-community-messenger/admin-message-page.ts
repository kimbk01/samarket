/**
 * 채팅 Admin R1 (B · C-6) — 관리자 메시지 조회 페이지네이션.
 *
 * 사용자 측 커서 의미(`listCommunityMessengerRoomMessagesBefore` / `...Latest`)를 그대로 쓴다.
 * - latest: 앵커 없이 최신 N건 (created_at desc, id desc) → 화면에는 오래된 → 최신 순.
 * - before: 앵커 메시지 id 의 created_at 보다 이전 N건.
 * - `limit + 1` 로 읽어 hasMore 판정. 기본 80 / 최대 100.
 *
 * 관리자 감사 화면이라 삭제·숨김 메시지도 포함한다 (사용자 측과 달리 deleted_at 필터 없음).
 * 읽기 전용 — 쓰기·읽음 표시·unread 를 건드리지 않는다. sb 는 호출부(서버)가 주입한다.
 */

export const ADMIN_CM_MESSAGE_PAGE_DEFAULT = 80;
export const ADMIN_CM_MESSAGE_PAGE_MAX = 100;

export function clampAdminCmMessagePageLimit(raw: unknown): number {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n <= 0) return ADMIN_CM_MESSAGE_PAGE_DEFAULT;
  return Math.min(ADMIN_CM_MESSAGE_PAGE_MAX, Math.max(1, n));
}

export type AdminCmMessagePageResult<Row> =
  | { ok: true; rows: Row[]; hasMore: boolean }
  | { ok: false; error: "anchor_not_found" | "load_failed" };

/** Pure: desc rows (limit+1) → asc page + hasMore. */
export function sliceAdminCmMessagePage<Row>(descRows: readonly Row[], limit: number): { rows: Row[]; hasMore: boolean } {
  const hasMore = descRows.length > limit;
  return { rows: descRows.slice(0, limit).reverse(), hasMore };
}

type QueryClient = { from: (table: string) => any };

export async function queryAdminCmMessagePage<Row = Record<string, unknown>>(
  sb: QueryClient,
  input: { roomId: string; select: string; before?: string | null; limit?: unknown }
): Promise<AdminCmMessagePageResult<Row>> {
  const roomId = input.roomId.trim();
  const limit = clampAdminCmMessagePageLimit(input.limit);
  const before = typeof input.before === "string" ? input.before.trim() : "";
  let anchorCreatedAt = "";
  if (before) {
    const { data: anchor, error: anchorErr } = await sb
      .from("community_messenger_messages")
      .select("id, created_at")
      .eq("id", before)
      .eq("room_id", roomId)
      .maybeSingle();
    if (anchorErr) return { ok: false, error: "load_failed" };
    anchorCreatedAt = typeof anchor?.created_at === "string" ? anchor.created_at.trim() : "";
    if (!anchorCreatedAt) return { ok: false, error: "anchor_not_found" };
  }
  let q = sb.from("community_messenger_messages").select(input.select).eq("room_id", roomId);
  if (anchorCreatedAt) q = q.lt("created_at", anchorCreatedAt);
  const { data, error } = await q
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);
  if (error) return { ok: false, error: "load_failed" };
  const page = sliceAdminCmMessagePage((data ?? []) as Row[], limit);
  return { ok: true, ...page };
}
