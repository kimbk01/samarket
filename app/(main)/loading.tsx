import { MainHomeShellLoading } from "@/components/layout/MainRouteLoading";

/**
 * `(main)` 세그먼트 라우트 전환 시 RSC 페치 동안 즉시 표시 — 하단 탭 이동 시 빈 화면·“멈춤” 체감 완화.
 * `home/loading.tsx` 와 동일 골격으로 두면 `/home` 하드 리로드 시 부모·자식 로딩 UI 전환 시 깜빡임이 줄어든다.
 * (각 페이지의 `loading.tsx`가 있으면 해당 세그먼트가 우선)
 */
export default function MainSegmentLoading() {
  return <MainHomeShellLoading />;
}
