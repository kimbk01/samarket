"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  isDeliveryRecruiting,
  isDeliveryRecruitingReviewer,
  useDeliveryLaunchState,
} from "@/lib/delivery/launch/use-delivery-launch-state";

/**
 * 배달 오픈 관리 — 매장 모집 중 고객 경로 정리 (Owner 2026-11-10 · 설계 v2 §4-1).
 * 업종·검색·장바구니·결제·주문 화면은 배달 첫 화면(`/stores`)으로 보낸다.
 * 매장 상세(`/stores/[slug]`)는 사장님 본인 판정이 필요해 `StoreDetailPublic` 이 따로 판단한다.
 * 사장님 화면(`/stores/owner/**`)·상품권몰은 건드리지 않는다. 주문은 서버(`/api/me/store-orders`)도 거부한다.
 */
export function isDeliveryRecruitingBlockedPath(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, "");
  if (p === "/stores/browse" || p.startsWith("/stores/browse/")) return true;
  if (p === "/stores/search" || p.startsWith("/stores/search/")) return true;
  if (p === "/stores/cart" || p.startsWith("/stores/cart/")) return true;
  const m = /^\/stores\/([^/]+)\/(cart|checkout|order)(\/|$)/.exec(p);
  return !!m && m[1] !== "owner" && m[1] !== "gift-mall";
}

/** 장바구니·결제·주문 — 확인용 계정(매장 모집 중 정식 화면)도 주문은 못 하므로 막는다 */
export function isDeliveryOrderFlowPath(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, "");
  if (p === "/stores/cart" || p.startsWith("/stores/cart/")) return true;
  const m = /^\/stores\/([^/]+)\/(cart|checkout|order)(\/|$)/.exec(p);
  return !!m && m[1] !== "owner" && m[1] !== "gift-mall";
}

export function DeliveryRecruitingRouteGuard() {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const state = useDeliveryLaunchState();
  const blocked =
    (isDeliveryRecruiting(state) && isDeliveryRecruitingBlockedPath(pathname)) ||
    (isDeliveryRecruitingReviewer(state) && isDeliveryOrderFlowPath(pathname));
  useEffect(() => {
    if (blocked) router.replace("/stores");
  }, [blocked, router]);
  return null;
}
