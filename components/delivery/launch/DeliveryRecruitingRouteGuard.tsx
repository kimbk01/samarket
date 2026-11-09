"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  isDeliveryRecruiting,
  isDeliveryRecruitingReviewer,
  peekDeliveryLaunchState,
  useDeliveryLaunchState,
} from "@/lib/delivery/launch/use-delivery-launch-state";

/**
 * 배달 오픈 관리 — 매장 모집 중 고객 경로 정리 (Owner 2026-11-10 · 설계 v3.2).
 * 업종·검색·장바구니·결제·주문 화면은 배달 첫 화면(`/stores`)으로 보낸다.
 * 매장 상세(`/stores/[slug]`)는 사장님 본인 판정이 필요해 `StoreDetailPublic` 이 따로 판단한다.
 * 매장 아래 화면(상품 상세 `/p/…`·정보·리뷰·신고)은 홈 선반 등에서 바로 들어오므로 여기서
 * 서버 판정(요약 API 의 보는 사람 값)으로 사장님 본인·관리자만 남기고 나머지는 배달 첫 화면으로 보낸다
 * (Owner 2026-11-10 「홈에서 매장을 눌러도 같은 매장 모집 화면, 지정 아이디 외 매장 진입 금지」).
 * 사장님 화면(`/stores/owner/**`)·상품권몰은 건드리지 않는다. 주문은 서버(`/api/me/store-orders`)도 거부한다.
 */
export function isDeliveryRecruitingBlockedPath(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, "");
  if (p === "/stores/browse" || p.startsWith("/stores/browse/")) return true;
  if (p === "/stores/search" || p.startsWith("/stores/search/")) return true;
  return isDeliveryOrderFlowPath(p);
}

/** 매장 아래 고객 화면(상품 상세·정보·리뷰·신고) — 매장 slug 를 돌려준다 */
export function deliveryRecruitingStoreSubpageSlug(pathname: string): string | null {
  const p = pathname.replace(/\/+$/, "");
  const m = /^\/stores\/([^/]+)\/(p|info|reviews|report)(\/|$)/.exec(p);
  if (!m || m[1] === "owner" || m[1] === "gift-mall" || m[1] === "browse" || m[1] === "search" || m[1] === "cart") {
    return null;
  }
  return decodeURIComponent(m[1]);
}

/** 요약 API 의 보는 사람 판정 — 사장님 본인(미리보기 포함)·관리자면 true */
async function viewerMayEnterStore(slug: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/stores/${encodeURIComponent(slug)}/summary`, { cache: "no-store" });
    if (!res.ok) return false;
    const j = (await res.json()) as { meta?: Record<string, unknown> };
    const m = j?.meta ?? {};
    return (
      m.viewer_is_owner === true ||
      m.owner_hidden_preview === true ||
      m.viewer_is_admin === true ||
      m.admin_preview === true
    );
  } catch {
    return false;
  }
}

/** 장바구니·결제·주문 — 확인용 계정(매장 모집 중 정식 화면)도 주문은 못 하므로 막는다 */
export function isDeliveryOrderFlowPath(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, "");
  if (p === "/stores/cart" || p.startsWith("/stores/cart/")) return true;
  const m = /^\/stores\/([^/]+)\/(cart|checkout|order)(\/|$)/.exec(p);
  return !!m && m[1] !== "owner" && m[1] !== "gift-mall";
}

const noopSubscribe = () => () => {};

export function DeliveryRecruitingRouteGuard() {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const state = useDeliveryLaunchState(true, { confirmedOnly: true });
  const blocked =
    (isDeliveryRecruiting(state) && isDeliveryRecruitingBlockedPath(pathname)) ||
    (isDeliveryRecruitingReviewer(state) && isDeliveryOrderFlowPath(pathname));
  useEffect(() => {
    if (blocked) router.replace("/stores");
  }, [blocked, router]);

  /** 매장 아래 화면 — 판정이 끝날 때까지 화면을 가린다(내용이 먼저 보이지 않게) */
  const subSlug = isDeliveryRecruiting(state) ? deliveryRecruitingStoreSubpageSlug(pathname) : null;
  const [allowedKey, setAllowedKey] = useState<string | null>(null);
  useEffect(() => {
    if (!subSlug) return;
    let alive = true;
    void viewerMayEnterStore(subSlug).then((ok) => {
      if (!alive) return;
      if (ok) setAllowedKey(subSlug);
      else router.replace("/stores");
    });
    return () => {
      alive = false;
    };
  }, [subSlug, router]);
  /** 서버 판정 전 — 이 기기가 마지막으로 본 상태가 모집이면 매장 아래 화면을 미리 가린다(정식 운영 기기는 지연 없음) */
  const hintRecruiting = useSyncExternalStore(
    noopSubscribe,
    () => isDeliveryRecruiting(peekDeliveryLaunchState()),
    () => false
  );
  const pendingSubSlug = state === null && hintRecruiting ? deliveryRecruitingStoreSubpageSlug(pathname) : null;
  if (pendingSubSlug || (subSlug && allowedKey !== subSlug)) {
    return <div className="fixed inset-0 z-[100] bg-sam-app" aria-hidden data-delivery-recruiting-route-cover />;
  }
  return null;
}
