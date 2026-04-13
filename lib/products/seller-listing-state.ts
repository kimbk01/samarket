/**
 * 판매자 공개 거래 단계 — DB posts.seller_listing_state 단일 소스
 * (목록·채팅 상단·어드민 동일 라벨)
 * 구매자/판매자 채팅 플로우 문서: `docs/trade-chat-buyer-seller-process.md`
 */

import {
  APP_FEED_LIST_ROW1_LAYOUT,
  APP_FEED_LIST_ROW1_TEXT_DETAIL,
  APP_FEED_LIST_ROW1_TEXT_LIST,
} from "@/lib/ui/app-feed-list-row1";

export type SellerListingState = "inquiry" | "negotiating" | "reserved" | "completed";

export const SELLER_LISTING_LABEL: Record<SellerListingState, string> = {
  inquiry: "판매중",
  negotiating: "문의중",
  reserved: "예약중",
  completed: "거래완료",
};

const ALLOWED: Set<string> = new Set(["inquiry", "negotiating", "reserved", "completed"]);

export function normalizeSellerListingState(
  raw: unknown,
  postStatus?: string
): SellerListingState {
  const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (ALLOWED.has(s)) return s as SellerListingState;
  const ps = (postStatus ?? "").toLowerCase();
  if (ps === "sold") return "completed";
  if (ps === "reserved") return "reserved";
  return "inquiry";
}

/** 숨김·판매완료(글 상태) 우선, 그다음 seller_listing_state */
export function publicListingBadge(
  sellerListingState: SellerListingState | undefined,
  postStatus: string | undefined
): { label: string; tone: "default" | "signature" | "amber" | "muted" } {
  const st = (postStatus ?? "active").toLowerCase();
  if (st === "hidden" || st === "blinded" || st === "deleted") {
    return { label: st === "hidden" ? "숨김" : st === "blinded" ? "숨김" : "삭제됨", tone: "muted" };
  }
  if (st === "sold") {
    return { label: "거래완료", tone: "muted" };
  }
  const ls = sellerListingState ?? normalizeSellerListingState(undefined, postStatus);
  const label = SELLER_LISTING_LABEL[ls];
  if (ls === "reserved") return { label, tone: "amber" };
  if (ls === "completed") return { label: "거래완료", tone: "muted" };
  if (ls === "negotiating") return { label, tone: "signature" };
  return { label, tone: "default" };
}

/**
 * 리스트 카드 1단 거래 상태 배지 — `APP_FEED_LIST_ROW1_*`와 동일 레이아웃(전 스킨 공통).
 * 판매중: 보라 채움·흰 글자 / 문의중·예약중: 윤곽 등
 */
export function listTradeStatusBadge(
  sellerListingStateRaw: unknown,
  postStatus: string | undefined,
  size: "list" | "detail" = "list"
): { label: string; className: string } | null {
  const st = (postStatus ?? "active").toLowerCase();
  if (st === "sold") return null;

  const ls = normalizeSellerListingState(sellerListingStateRaw, postStatus);
  if (ls === "completed") return null;

  const { label } = publicListingBadge(ls, postStatus);

  const textSz = size === "detail" ? APP_FEED_LIST_ROW1_TEXT_DETAIL : APP_FEED_LIST_ROW1_TEXT_LIST;
  const row1BadgeBase = `${APP_FEED_LIST_ROW1_LAYOUT} ${textSz}`;

  if (st === "hidden" || st === "blinded" || st === "deleted") {
    return {
      label,
      className: `${row1BadgeBase} border border-gray-300 bg-gray-100 text-gray-600`,
    };
  }

  const classes: Record<Exclude<SellerListingState, "completed">, string> = {
    inquiry: `${row1BadgeBase} border-0 bg-signature text-white`,
    negotiating: `${row1BadgeBase} border border-signature bg-white text-signature`,
    reserved: `${row1BadgeBase} border border-signature bg-white text-signature`,
  };
  return { label, className: classes[ls] };
}

/** 채팅 상단 거래상태 박스 — border-radius 0, 상태별 테두리·배경 (판매자·구매자 동일 토큰) */
const CHAT_LISTING_STATE_BOX: Record<SellerListingState, string> = {
  inquiry: "border-2 border-current bg-slate-100 text-slate-800",
  negotiating: "border-2 border-current bg-signature/10 text-signature",
  reserved: "border-2 border-current bg-amber-50 text-amber-900",
  completed: "border-2 border-current bg-zinc-100 text-zinc-900",
};

/**
 * 채팅 상품 줄 — 거래 상태 박스용 라벨 + Tailwind 클래스
 * (숨김/삭제 등 글 상태는 배지 로직과 동일하게 처리)
 */
export function getChatListingBoxPresentation(
  sellerListingStateRaw: unknown,
  postStatus: string | undefined
): { label: string; boxClass: string } {
  const st = (postStatus ?? "active").toLowerCase();
  if (st === "hidden" || st === "blinded" || st === "deleted") {
    return {
      label: st === "hidden" ? "숨김" : st === "blinded" ? "숨김" : "삭제됨",
      boxClass: "border-2 border-current bg-gray-100 text-gray-600",
    };
  }
  const ls = normalizeSellerListingState(sellerListingStateRaw, postStatus);
  const { label } = publicListingBadge(ls, postStatus);
  return { label, boxClass: CHAT_LISTING_STATE_BOX[ls] };
}

export function chatListingBoxClassForState(state: SellerListingState): string {
  return CHAT_LISTING_STATE_BOX[state];
}
