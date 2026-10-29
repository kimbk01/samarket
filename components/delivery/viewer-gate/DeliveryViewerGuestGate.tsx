"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useClientMembershipState } from "@/hooks/use-client-membership-state";
import { DeliveryViewerGatePanel } from "@/components/delivery/viewer-gate/DeliveryViewerGatePanel";
import { StoreDeliveryListLoading } from "@/components/stores/StoreDeliveryListLoading";
import { MAIN_BOTTOM_NAV_BODY_CLEARANCE_CLASS } from "@/lib/layout/main-bottom-nav-hub-clearance";
import { isStoreConsumerDetailPath } from "@/lib/dibay/delivery-list-scroll-restore";
import { isDeliveryViewerGatedPath } from "@/lib/stores/delivery-viewer-gate";
import { STORES_DELIVERY_CONTENT_INNER_CLASS } from "@/lib/stores/stores-home-ui";

/**
 * S-07 — 비로그인은 배달 홈·업종·검색·매장 상세를 볼 수 없다 (화면 게이트).
 * proxy / guest-browse 정책은 그대로 두고(다른 서비스 비회원 정책 불변) 메신저
 * `CommunityMessengerGuestGate` 와 같은 방식으로 화면 안에서 로그인 유도.
 *
 * - membership `checking`: 목록 경로는 그대로 렌더(API 가 `login_required` 로 목록을 비워 반환),
 *   매장 상세 경로는 기존 목록 스피너 — 확정 전 상세 데이터를 그리지 않는다.
 * - 확정된 상태는 모듈 공유 store 라 탭 이동 때 다시 `checking` 이 되지 않는다(깜빡임 없음).
 */
export function DeliveryViewerGuestGate({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const membership = useClientMembershipState("delivery-viewer-guest-gate");
  const gated = isDeliveryViewerGatedPath(pathname);

  if (!gated || membership.status === "member") return <>{children}</>;

  if (membership.status === "checking") {
    if (!isStoreConsumerDetailPath(pathname)) return <>{children}</>;
    return (
      <div className={`min-h-[40vh] ${MAIN_BOTTOM_NAV_BODY_CLEARANCE_CLASS}`}>
        <StoreDeliveryListLoading />
      </div>
    );
  }

  return (
    <div className={`min-h-[50vh] bg-sam-app ${MAIN_BOTTOM_NAV_BODY_CLEARANCE_CLASS}`}>
      <div className={`${STORES_DELIVERY_CONTENT_INNER_CLASS} pt-8`}>
        <DeliveryViewerGatePanel gate="login_required" />
      </div>
    </div>
  );
}
