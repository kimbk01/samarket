"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { OWNER_HUB_DASHBOARD_QP } from "@/lib/business/owner-routes";

export type HubPushPercent = 0 | -100;

export type OwnerHubDashboardPanelContextValue = {
  dashboardOpen: boolean;
  openDashboard: () => void;
  closeDashboard: () => void;
  /** 허브 셸 전체를 뷰포트 폭만큼 좌로 밀어 대시보드가 우→좌로 들어오는 푸시와 동기 */
  hubPushPercent: HubPushPercent;
  setHubPushPercent: (p: HubPushPercent) => void;
};

const OwnerHubDashboardPanelContext = createContext<OwnerHubDashboardPanelContextValue | null>(null);

export function useOwnerHubDashboardPanel(): OwnerHubDashboardPanelContextValue | null {
  return useContext(OwnerHubDashboardPanelContext);
}

/**
 * 허브(`/stores/owner`) 운영 대시보드 — 열림은 `hubDashboard=1` 쿼리와 동기화.
 * 시각적 Slide Push 는 Expandable 이 `hubPushPercent` 와 패널 transform 을 같이 갱신한다.
 */
export function OwnerHubDashboardPanelProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();

  const [hubPushPercent, setHubPushPercent] = useState<HubPushPercent>(0);

  const onHub = pathname.replace(/\/+$/, "") === "/stores/owner";
  const dashboardOpen = onHub && searchParams.get(OWNER_HUB_DASHBOARD_QP) === "1";

  const openDashboard = useCallback(() => {
    const next = new URLSearchParams(searchParams.toString());
    next.set(OWNER_HUB_DASHBOARD_QP, "1");
    const qs = next.toString();
    if (!onHub) {
      router.push(`/stores/owner?${qs}`);
      return;
    }
    router.replace(`/stores/owner?${qs}`, { scroll: false });
  }, [onHub, router, searchParams]);

  const closeDashboard = useCallback(() => {
    const next = new URLSearchParams(searchParams.toString());
    if (!next.has(OWNER_HUB_DASHBOARD_QP)) return;
    next.delete(OWNER_HUB_DASHBOARD_QP);
    const qs = next.toString();
    router.replace(qs ? `/stores/owner?${qs}` : "/stores/owner", { scroll: false });
  }, [router, searchParams]);

  const value = useMemo(
    () => ({
      dashboardOpen,
      openDashboard,
      closeDashboard,
      hubPushPercent,
      setHubPushPercent,
    }),
    [dashboardOpen, openDashboard, closeDashboard, hubPushPercent],
  );

  return (
    <OwnerHubDashboardPanelContext.Provider value={value}>{children}</OwnerHubDashboardPanelContext.Provider>
  );
}
