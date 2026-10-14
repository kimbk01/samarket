"use client";

import { clearBootstrapCache } from "@/lib/community-messenger/bootstrap-cache";
import type { MessengerHomeRefreshReport } from "@/lib/community-messenger/home/use-community-messenger-home-bootstrap";
import type { DibayPtrOutcome } from "@/lib/ui/ptr/dibay-ptr-ssot";

/**
 * 메신저 홈 PTR — stale bootstrap 캐시를 비우고 비-silent refresh 로 목록을 다시 맞춘다.
 * 실패 시 화면의 기존 목록은 refresh 가 보존한다(`hadVisibleDataAtStart`).
 * 다른 refresh 라운드가 진행 중이면 refresh 가 skip → `cancelled`.
 */
export async function runMessengerHomePullRefresh(
  refresh: (silent?: boolean, report?: MessengerHomeRefreshReport) => Promise<void>
): Promise<DibayPtrOutcome> {
  clearBootstrapCache();
  const report: MessengerHomeRefreshReport = { outcome: "cancelled" };
  await refresh(false, report);
  return report.outcome;
}
