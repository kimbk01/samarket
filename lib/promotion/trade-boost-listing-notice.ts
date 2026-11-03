/**
 * 거래 상위노출 ↔ 글 상태 연동 (설계 docs/audit/trade-promotion-listing-lifecycle-design-2026-11-03.md)
 * 판매완료·삭제 = 광고 종료(환급 0), 숨김 = 광고 일시정지 — DB 트리거 `trg_posts_zz_trade_promotion_sync` 가 처리한다.
 * 확인창에는 그 글이 광고 중(진행·일시정지)일 때만 한 줄을 더 보여 준다.
 */
import type { MessageKey } from "@/lib/i18n/messages";

export type TradeBoostListingAction = "sold" | "delete" | "hide";

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

/** 광고하기 창과 같은 API(`activeForTarget`) — 조회 실패면 안내를 붙이지 않는다(동작은 서버 트리거가 보장) */
export async function isTradeBoostRunningForPost(postId: string): Promise<boolean> {
  const id = postId.trim();
  if (!id) return false;
  try {
    const res = await fetch(
      `/api/me/points/promotion-orders?domain=trade&targetId=${encodeURIComponent(id)}`,
      { credentials: "include", cache: "no-store" }
    );
    if (!res.ok) return false;
    const json = (await res.json().catch(() => null)) as { activeForTarget?: { orderStatus?: string } | null } | null;
    const st = String(json?.activeForTarget?.orderStatus ?? "").toLowerCase();
    return st === "active" || st === "paused";
  } catch {
    return false;
  }
}

export function tradeBoostListingNoteKey(action: TradeBoostListingAction): MessageKey {
  return action === "hide" ? "trade_ad_listing_note_hide" : "trade_ad_listing_note_end";
}

/** 확인창 설명 = 기존 문구 + (광고 중이면) 광고 안내 한 줄 */
export async function withTradeBoostListingNote(
  t: Translate,
  postId: string,
  action: TradeBoostListingAction,
  description?: string
): Promise<string | undefined> {
  if (!(await isTradeBoostRunningForPost(postId))) return description;
  const note = t(tradeBoostListingNoteKey(action));
  return description ? `${description} ${note}` : note;
}
