/**
 * 매장 오너 편집 화면(`/stores/owner/basic-info`, `/stores/owner/profile`) 이탈 가드용.
 * 한 번에 하나의 폼만 마운트된다고 가정하고 dirty 플래그를 공유한다.
 */

export type OwnerBasicInfoLeaveKind = "sidebar" | "back";

export type OwnerBasicInfoLeaveDetail = {
  href: string;
  kind: OwnerBasicInfoLeaveKind;
};

export const OWNER_BASIC_INFO_LEAVE_EVENT = "samarket:owner-basic-info-leave";

let dirty = false;
const dirtySubscribers = new Set<() => void>();

export function getOwnerBasicInfoDirty(): boolean {
  return dirty;
}

export function setOwnerBasicInfoDirty(next: boolean): void {
  if (dirty === next) return;
  dirty = next;
  for (const cb of dirtySubscribers) cb();
}

export function subscribeOwnerBasicInfoDirty(cb: () => void): () => void {
  dirtySubscribers.add(cb);
  return () => {
    dirtySubscribers.delete(cb);
  };
}

export function emitOwnerBasicInfoLeave(detail: OwnerBasicInfoLeaveDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OWNER_BASIC_INFO_LEAVE_EVENT, { detail }));
}

export function isOwnerBasicInfoPath(pathname: string): boolean {
  const p = pathname.split("?")[0]?.replace(/\/+$/, "") ?? "";
  return p.endsWith("/stores/owner/basic-info");
}

export function isOwnerStoreProfilePath(pathname: string): boolean {
  const p = pathname.split("?")[0]?.replace(/\/+$/, "") ?? "";
  return p.endsWith("/stores/owner/profile");
}

export function isOwnerInquiriesPath(pathname: string): boolean {
  const p = pathname.split("?")[0]?.replace(/\/+$/, "") ?? "";
  return (
    p.endsWith("/stores/owner/inquiries") ||
    p.endsWith("/my/business/inquiries") ||
    p.endsWith("/mypage/business/inquiries")
  );
}

/** 사이드바·뒤로가기 가드: 기본 정보 또는 매장 설정(프로필) */
export function isOwnerStoreAdminDirtyGuardPath(pathname: string): boolean {
  return isOwnerBasicInfoPath(pathname) || isOwnerStoreProfilePath(pathname);
}

/** 통합 주문 관리 — 오너 5탭 하단 네비 없이 KPI·탭·목록만 */
export function isOwnerStoreOrdersPath(pathname: string): boolean {
  const p = pathname.split("?")[0]?.replace(/\/+$/, "") ?? "";
  return p === "/stores/owner/orders";
}

/** 하단 `OwnerMobileBottomNav` 숨김 — 편집 폼·문의·주문 관리 등 전체 화면 서브라우트 */
export function isOwnerStoreFormBottomNavHiddenPath(pathname: string): boolean {
  return (
    isOwnerBasicInfoPath(pathname) ||
    isOwnerStoreProfilePath(pathname) ||
    isOwnerInquiriesPath(pathname) ||
    isOwnerStoreOrdersPath(pathname)
  );
}
