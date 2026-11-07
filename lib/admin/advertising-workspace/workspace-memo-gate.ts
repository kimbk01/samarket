import "server-only";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import type { WorkspaceEntityFamily } from "@/lib/admin/advertising-workspace/resolve-drawer-actions";

/**
 * 광고 워크스페이스 계열별 서버 가드 (G-01 · IA-04 「같은 업무 = 같은 키」) — 조치 API 와 내부 메모 조회가 같이 쓴다.
 * - 배달 광고·사장님 팝업 신청 = business · 피드 배너·플랫폼 팝업 = ads
 * - 거래·커뮤니티 상위노출 = ads (광고 SSOT §4 · 2026-11-07 — 도메인 API `requireAdsWriteAdmin` 과 같은 키 · 모든 조치)
 * null = 이 단계에서 추가 가드 없음.
 */
export async function requireAdvertisingWorkspaceFamilyGate(
  family: WorkspaceEntityFamily,
  opts: { internalMemo: boolean }
) {
  if (family === "delivery_banner" || family === "delivery_sponsored" || family === "platform_popup_request") {
    return requireAdminPermission("business");
  }
  if (family === "feed_banner" || family === "platform_popup_campaign") {
    return requireAdminPermission("ads");
  }
  // 광고 SSOT §4 (2026-11-07): 상위노출은 모든 조치(메모 포함)에서 ads — 조치 API 의 계열 분기 가드(거래 = 전원)보다 먼저 건다.
  if (family === "boost_trade" || family === "boost_community") return requireAdminPermission("ads");
  void opts;
  return null;
}

/** 내부 메모 감사 기록 대상 종류 — `persistAdvertisingAdminMemo` 저장과 조회가 같은 값을 쓴다 */
export function advertisingWorkspaceMemoTargetType(family: WorkspaceEntityFamily): string {
  return `advertising:${family}`;
}
