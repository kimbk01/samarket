"use client";

type Props = {
  initialTab?: string;
  initialSection?: string;
  initialFilter?: string;
  initialKind?: string;
};

/** 메신저 허브 route — 목록 렌더는 `MessengerResponsiveShell`(모바일 상주 홈 / 와이드 split) 이 소유. */
export function MessengerHubRouteGate({
  initialTab,
  initialSection,
  initialFilter,
  initialKind,
}: Props) {
  /**
   * 목록은 레이아웃 셸이 소유 — 768px+ `MessengerSplitListPane`, <768 `MessengerResponsiveShell` 의 상주 홈
   * (방 진입·복귀 때 목록을 다시 만들지 않기 위해). 이 page 는 아무것도 그리지 않는다.
   */
  void initialTab;
  void initialSection;
  void initialFilter;
  void initialKind;
  return null;
}
