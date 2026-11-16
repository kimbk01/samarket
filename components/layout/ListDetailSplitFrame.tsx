"use client";

import type { ReactNode } from "react";
import { AppStickyHeader } from "@/components/layout/AppStickyHeader";
import { BottomNavShowingRouteContexts } from "@/components/layout/BottomNavShowingRouteContexts";
import { MainTier1ExtrasHubScope } from "@/contexts/MainTier1ExtrasContext";
import { MAIN_HUB_SCROLL_HEADER_CLASS } from "@/lib/layout/main-hub-scroll-column";

/**
 * S4 — 넓은 창 목록 | 상세 두 칸 틀 (`app/app-list-detail-split.css`).
 *
 * 요소 구조는 한 화면·두 칸 모두 같다(틀 → 목록 칸[머리글 자리, 스크롤] · 상세 칸[스크롤]).
 * 한 화면일 때는 CSS `display: contents` 로 레이아웃에서만 빠진다 → 회전해도 목록·상세 다시 마운트 0 (R4).
 * 목록 칸 머리글 = 셸 1단 머리글을 허브 주소 문맥으로 그린 것(그 허브가 등록한 2단 칩만), 상세 칸 머리글 = 지금 경로 머리글.
 * 두 칸일 때만 그리고, 셸 쪽 머리글은 그때 숨긴다.
 */
export function ListDetailSplitFrame({
  active,
  showList,
  hubPath,
  detailHeader,
  list,
  detail,
}: {
  /** 두 칸 */
  active: boolean;
  /** 목록 칸에 보관 허브가 있다(없으면 상세만 창 전체 — 상세 주소로 바로 들어온 첫 화면) */
  showList: boolean;
  /** 목록 칸 머리글을 그릴 허브 주소 */
  hubPath: string | null;
  /** 상세 칸에 지금 경로 머리글(상세 제목·공유)을 그린다 — 상세 경로일 때 */
  detailHeader: boolean;
  list: ReactNode;
  detail: ReactNode;
}) {
  return (
    <div className="list-detail-split" data-list-detail-split={active ? "split" : "stack"}>
      <section data-list-detail-pane="list" data-list-pane-empty={active && !showList ? "" : undefined}>
        {active && showList && hubPath ? (
          <div className={MAIN_HUB_SCROLL_HEADER_CLASS} data-list-detail-header="">
            <BottomNavShowingRouteContexts target={{ path: hubPath, search: "" }}>
              <MainTier1ExtrasHubScope hubPath={hubPath}>
                <AppStickyHeader />
              </MainTier1ExtrasHubScope>
            </BottomNavShowingRouteContexts>
          </div>
        ) : null}
        <div data-list-detail-scroll="">{list}</div>
      </section>
      <section data-list-detail-pane="detail">
        {active && detailHeader ? (
          <div className={MAIN_HUB_SCROLL_HEADER_CLASS} data-list-detail-header="detail">
            <AppStickyHeader />
          </div>
        ) : null}
        <div data-list-detail-scroll="">{detail}</div>
      </section>
    </div>
  );
}
