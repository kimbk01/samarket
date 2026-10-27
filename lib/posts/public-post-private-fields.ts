/**
 * 거래 글 공개 응답에서 빼는 값 (TM-02 · TM-29)
 * - 예약·판매완료 구매자 user_id: 목록에는 내리지 않고, 상세는 판매자·해당 구매자에게만
 * - 거래 희망 장소 좌표·place_id: 목록에는 표시 문구만 (좌표는 상세 전용)
 *
 * 서버 읽기는 service-role 이라 DB 마스킹(`posts_mask_reserved_buyer_id`)이 적용되지 않는다 → 응답 경계에서 제거.
 */

const MEET_SPOT_LIST_PRIVATE_KEYS = ["lat", "lng", "place_id"] as const;

function stripMeetSpotCoordsFromMeta(meta: unknown): unknown {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return meta;
  const m = meta as Record<string, unknown>;
  const spot = m.trade_meet_spot;
  if (!spot || typeof spot !== "object" || Array.isArray(spot)) return meta;
  const s = spot as Record<string, unknown>;
  if (!MEET_SPOT_LIST_PRIVATE_KEYS.some((k) => k in s)) return meta;
  const nextSpot: Record<string, unknown> = { ...s };
  for (const k of MEET_SPOT_LIST_PRIVATE_KEYS) delete nextSpot[k];
  return { ...m, trade_meet_spot: nextSpot };
}

/** 목록·카드 응답용 — 구매자 id 와 거래장소 좌표 제거 */
export function stripTradeListPrivateFields<T extends Record<string, unknown>>(row: T): T {
  const out: Record<string, unknown> = { ...row };
  if ("reserved_buyer_id" in out) out.reserved_buyer_id = null;
  if ("sold_buyer_id" in out) out.sold_buyer_id = null;
  if ("meta" in out) out.meta = stripMeetSpotCoordsFromMeta(out.meta);
  return out as T;
}

/** 상세 응답용 — 구매자 id 는 판매자·해당 구매자 본인에게만 */
export function maskTradeDetailBuyerFields<T extends Record<string, unknown>>(
  row: T,
  viewerUserId: string | null | undefined
): T {
  const viewer = typeof viewerUserId === "string" ? viewerUserId.trim() : "";
  const sellerId = typeof row.user_id === "string" ? row.user_id : "";
  const out: Record<string, unknown> = { ...row };
  for (const key of ["reserved_buyer_id", "sold_buyer_id"] as const) {
    const v = out[key];
    if (v == null || v === "") continue;
    const canSee = Boolean(viewer) && (viewer === sellerId || viewer === v);
    if (!canSee) out[key] = null;
  }
  return out as T;
}
