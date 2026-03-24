/**
 * 20단계: 관리자 배너 타입
 */

export type BannerStatus =
  | "draft"
  | "active"
  | "paused"
  | "expired"
  | "hidden";

export type BannerPlacement =
  | "home_top"
  | "home_middle"
  | "product_detail"
  | "search_top"
  | "mypage_top";

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

export interface BannerPlacementDef {
  key: BannerPlacement;
  label: string;
  description: string;
  maxVisibleCount: number;
}
