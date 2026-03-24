/**
 * 5단계: 상품 상태 라벨·필터·액션 타입
 */

import type { ProductStatus } from "@/lib/types/product";

export const STATUS_LABEL: Record<ProductStatus, string> = {
  active: "판매중",
  reserved: "예약중",
  sold: "판매완료",
  hidden: "숨김",
  blinded: "블라인드",
  deleted: "삭제됨",
};

export type MyProductFilterKey = "all" | "active" | "reserved" | "sold" | "hidden";

export const MY_PRODUCT_FILTER_OPTIONS: { value: MyProductFilterKey; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "active", label: "판매중" },
  { value: "reserved", label: "예약중" },
  { value: "sold", label: "판매완료" },
  { value: "hidden", label: "숨김" },
];

export type StatusChangeActionType =
  | "edit"
  | "bump"
  | "reserve"
  | "sold"
  | "active"
  | "hide"
  | "delete";

export interface StatusChangeRecord {
  productId: string;
  fromStatus: ProductStatus;
  toStatus: ProductStatus;
  changedAt: string;
  actionType: StatusChangeActionType;
}
