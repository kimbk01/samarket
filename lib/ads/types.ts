/**
 * 사마켓 유료 광고 시스템 타입 정의
 *
 * 광고 흐름:
 *  광고주가 게시글 선택 → 광고 상품 선택 → 포인트 차감 or 입금 신청
 *  → 관리자 승인 → active → 피드 상단 노출 → 기간 종료 → expired
 */

/** 광고 노출 형식 */
export type AdType = "top_fixed" | "mid_insert" | "highlight";

/** 광고 신청 상태 */
export type AdApplyStatus =
  | "draft"            // 임시저장
  | "pending_payment"  // 결제 대기
  | "pending_review"   // 관리자 승인 대기
  | "approved"         // 승인 완료 (start_at 이전)
  | "active"           // 노출 중
  | "rejected"         // 반려
  | "expired"          // 기간 만료
  | "cancelled";       // 취소

/** 결제 방식 */
export type AdPaymentMethod = "points" | "bank_transfer" | "manual";

/** 입금 요청 상태 */
export type AdPaymentStatus = "pending" | "checking" | "confirmed" | "rejected" | "cancelled";

/* ─── 광고 상품 ──────────────────────────────────────────────────────── */
export interface AdProduct {
  id: string;
  name: string;
  description: string;
  /** 적용 게시판 키. null이면 전체 */
  boardKey: string | null;
  adType: AdType;
  durationDays: number;
  pointCost: number;
  priorityDefault: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/* ─── 광고 신청 ──────────────────────────────────────────────────────── */
export interface PostAd {
  id: string;
  postId: string;
  userId: string;
  adProductId: string;
  /** 광고 상품 이름 (조인) */
  adProductName?: string;
  boardKey: string;
  adType: AdType;
  applyStatus: AdApplyStatus;
  paymentMethod: AdPaymentMethod;
  pointCost: number;
  paidAmount: number;
  startAt: string | null;
  endAt: string | null;
  priority: number;
  isActive: boolean;
  adminNote: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  rejectedBy: string | null;
  rejectedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** 게시글 제목 (조인) */
  postTitle?: string;
  /** 광고주 닉네임 (조인) */
  userNickname?: string;
}

/** 피드에 삽입될 광고 게시글 (일반 게시글 + 광고 메타) */
export interface AdFeedPost {
  /** 광고 신청 ID */
  adId: string;
  /** 게시글 ID */
  postId: string;
  postTitle: string;
  postSummary: string;
  postImages: string[];
  locationLabel: string;
  boardKey: string;
  adType: AdType;
  priority: number;
  startAt: string;
  endAt: string;
  /** 광고주 닉네임 */
  advertiserName: string;
}

/* ─── 입금/결제 요청 ─────────────────────────────────────────────────── */
export interface AdPaymentRequest {
  id: string;
  postAdId: string;
  userId: string;
  paymentMethod: AdPaymentMethod;
  depositorName: string;
  requestedAmount: number;
  memo: string;
  paymentStatus: AdPaymentStatus;
  confirmedBy: string | null;
  confirmedAt: string | null;
  adminNote: string | null;
  createdAt: string;
  updatedAt: string;
  /** 연결된 광고 신청 요약 */
  postAdSummary?: string;
  userNickname?: string;
}

/* ─── 광고 로그 ──────────────────────────────────────────────────────── */
export interface AdLog {
  id: string;
  postAdId: string;
  actorId: string | null;
  /** approved | rejected | cancelled | expired | payment_confirmed | note_updated */
  logType: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

/* ─── API 응답 ───────────────────────────────────────────────────────── */
export interface AdProductsResponse {
  ok: boolean;
  products: AdProduct[];
}

export interface AdApplyRequest {
  postId: string;
  adProductId: string;
  paymentMethod: AdPaymentMethod;
  /** bank_transfer일 때 입금자명 */
  depositorName?: string;
  memo?: string;
}

export interface AdApplyResponse {
  ok: boolean;
  adId?: string;
  error?: string;
  /** 포인트 부족 시 */
  pointShortfall?: number;
}

/**
 * 커뮤니티 상위노출 표시 재설계 (Owner 2026-11-04 「배경 + 글자」):
 * - 회원 화면 응답에는 **남은 기간(endAt)을 싣지 않는다** — 남은 기간은 작성자 본인만(결제 창·마이 › 광고).
 * - `feedPost` = 일반 목록과 같은 카드 값(작성자·지역·조회수·댓글·사진·시간·주제) — 위쪽 고정도 일반 카드로 그린다.
 * 광고 ② PV-4·PB-21 (2026-11-04):
 * - 결제 시각(`startAt`)·순위(`priority`)·주문 id 를 싣지 않는다. `adId` 는 화면 key 용으로 **글 id** 와 같다.
 * - 광고 중인 글 **전체**를 싣는다(안전 상한 500). 위쪽 `PROMOTED_TOP_PINS_MAX`(1)개만 `feedPost` 가 있고, 나머지는 id 만(`feedPost: null`) —
 *   일반 자리에 나온 같은 글에 「포인트 노출」 표시용.
 */
export type ActiveAdFeedItem = {
  /** 화면 key — 글 id 와 같다 (주문 id 아님) */
  adId: string;
  postId: string;
  feedPost: import("@/lib/neighborhood/types").NeighborhoodFeedPostDTO | null;
};

export interface ActiveAdsResponse {
  ok: boolean;
  ads: ActiveAdFeedItem[];
  /** 조회 출처 — 클라이언트는 무시 가능 */
  meta?: {
    source: "supabase" | "memory" | "empty" | "point_promotion_orders";
    hint?: string;
  };
}

/** GET /api/me/post-ads */
export type MePostAdsMeta = {
  source: "supabase" | "missing_table" | "unavailable";
  hint?: string;
};

/** 관리자용 광고 신청 행 (목록 표시) */
export interface AdminPostAdRow {
  id: string;
  postId: string;
  postTitle: string;
  userId: string;
  userNickname: string;
  boardKey: string;
  adProductName: string;
  adType: AdType;
  applyStatus: AdApplyStatus;
  paymentMethod: AdPaymentMethod;
  pointCost: number;
  startAt: string | null;
  endAt: string | null;
  adminNote: string | null;
  createdAt: string;
}

