/**
 * 20단계: 관리자 배너 타입
 */

export type BannerStatus =
  | "draft"
  | "active"
  | "paused"
  | "expired"
  | "hidden";

/**
 * 재감사 R3 (B-6 마무리): 이 어드민(`my_page_banners`)은 마이페이지 CMS 배너 하나뿐 — 저장 시 `mypage_top` 고정
 * (`admin-banners-db.ts`). 쓰지 않던 레거시 위치(home_top·home_middle·product_detail·search_top)는 타입에서도 뺀다.
 */
export type BannerPlacement = "mypage_top";

export interface AdminBanner {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  mobileImageUrl: string;
  targetUrl: string;
  placement: BannerPlacement;
  status: BannerStatus;
  priority: number;
  startAt: string;
  endAt: string;
  clickCount: number;
  impressionCount: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  adminMemo?: string;
}

export type BannerChangeActionType =
  | "create"
  | "update"
  | "activate"
  | "pause"
  | "hide"
  | "reorder"
  | "expire";

export interface BannerChangeLog {
  id: string;
  bannerId: string;
  actionType: BannerChangeActionType;
  adminId: string;
  adminNickname: string;
  note: string;
  createdAt: string;
}

