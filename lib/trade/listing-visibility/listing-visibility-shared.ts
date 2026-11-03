/**
 * 거래 글 공개 자격 변경 방송 — 토픽·이벤트·페이로드 (서버·브라우저 공용 · 런타임 import 없음).
 * 설계: docs/audit/trade-visibility-admin-full-design-2026-11-04.md §1-3.
 * 관리자 숨김·삭제, 판매자 숨김·삭제처럼 **목록에서 빠져야 하는 순간** 서버가 1회 보낸다(판매완료는 목록에 남으므로 보내지 않음).
 * 권한: `internal.cm_realtime_can_read_topic` — 로그인 회원만 받는다(비로그인은 복귀 재확인으로 맞춘다).
 */
export const TRADE_LISTING_VISIBILITY_TOPIC = "trade-listing-visibility";
export const TRADE_LISTING_VISIBILITY_EVENT = "visibility";

export type TradeListingVisibilityReason = "admin_hidden" | "admin_deleted" | "owner_hidden" | "owner_deleted" | "restored";

export type TradeListingVisibilityPayload = {
  v: 1;
  postId: string;
  visible: boolean;
  reason: TradeListingVisibilityReason;
};

export function parseTradeListingVisibilityPayload(raw: unknown): TradeListingVisibilityPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.v !== 1) return null;
  const postId = typeof r.postId === "string" ? r.postId.trim() : "";
  if (!postId || typeof r.visible !== "boolean") return null;
  const reason = String(r.reason ?? "") as TradeListingVisibilityReason;
  if (!["admin_hidden", "admin_deleted", "owner_hidden", "owner_deleted", "restored"].includes(reason)) return null;
  return { v: 1, postId, visible: r.visible, reason };
}

/**
 * D-4: 거래 글 공개 자격 판정 1곳 — 채팅·메신저 상품 카드가 같이 쓴다.
 * DB 트리거 `posts_visibility_gate` 가 관리자·판매자 숨김·삭제를 `status='hidden'` 으로 맞추므로 status 가 기준이고,
 * 행에 moderation_state·owner_state·is_deleted 가 있으면 같이 본다(읽기 표에 없을 수 있음).
 */
export function isTradePostPubliclyVisible(row: {
  status?: string | null;
  moderation_state?: string | null;
  owner_state?: string | null;
  is_deleted?: boolean | null;
}): boolean {
  const st = String(row.status ?? "").trim().toLowerCase();
  if (st === "hidden" || st === "deleted" || st === "blinded") return false;
  if (row.is_deleted === true) return false;
  if (row.moderation_state != null && row.moderation_state !== "visible") return false;
  if (row.owner_state != null && row.owner_state !== "none") return false;
  return true;
}
