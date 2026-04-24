"use client";

import { useCallback } from "react";
import { usePhilifeWriteSheetOptional } from "@/contexts/PhilifeWriteSheetContext";
import { useTradeWriteSheetOptional } from "@/contexts/TradeWriteSheetContext";

/**
 * 거래·필라이프 **인라인 글쓰기 시트**가 열린 뒤 다른 탭·피드 탭 등으로 나가기 전에
 * 초안이 있으면 확인하고 시트를 닫는다. `false`면 호출부에서 `preventDefault` 등으로 이탈 중단.
 */
export function useInlineWriteSheetNavigationGuard(): { guardBeforeNavigate: () => boolean } {
  const philifeWrite = usePhilifeWriteSheetOptional();
  const tradeWrite = useTradeWriteSheetOptional();

  const guardBeforeNavigate = useCallback((): boolean => {
    if (philifeWrite && !philifeWrite.attemptLeaveForExternalNavigation()) return false;
    if (tradeWrite && !tradeWrite.attemptLeaveForExternalNavigation()) return false;
    return true;
  }, [philifeWrite, tradeWrite]);

  return { guardBeforeNavigate };
}
