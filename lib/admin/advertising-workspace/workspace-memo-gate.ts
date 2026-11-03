import "server-only";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { requireCommunityAdmin } from "@/lib/admin/community-admin/community-admin-guards";
import { requireTradeAdmin } from "@/lib/admin/trade-admin/trade-admin-guards";
import type { WorkspaceEntityFamily } from "@/lib/admin/advertising-workspace/resolve-drawer-actions";

/**
 * 광고 워크스페이스 계열별 서버 가드 (G-01 · IA-04 「같은 업무 = 같은 키」) — 조치 API 와 내부 메모 조회가 같이 쓴다.
 * - 배달 광고·사장님 팝업 신청 = business · 피드 배너·플랫폼 팝업 = ads
 * - 거래 홍보 = requireTradeAdmin · 커뮤니티 홍보 = requireCommunityAdmin("promotion")
 *   (홍보 계열은 조치 API 안의 계열 분기에서 다시 강제하므로, `internalMemo` 일 때만 여기서 건다)
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
  if (opts.internalMemo && family === "boost_trade") return requireTradeAdmin();
  if (opts.internalMemo && family === "boost_community") return requireCommunityAdmin("promotion");
  return null;
}

/** 내부 메모 감사 기록 대상 종류 — `persistAdvertisingAdminMemo` 저장과 조회가 같은 값을 쓴다 */
export function advertisingWorkspaceMemoTargetType(family: WorkspaceEntityFamily): string {
  return `advertising:${family}`;
}
