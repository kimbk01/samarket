"use client";

import { createDibayPtrStore } from "@/lib/ui/ptr/create-dibay-ptr-store";
import { preflightMainHubPtrRefresh } from "@/lib/layout/main-hub-ptr-preflight";
import type { DibayPtrHandler, DibayPtrRunResult } from "@/lib/ui/ptr/dibay-ptr-ssot";

/**
 * 내정보 홈(`/mypage`·`/my`) 당겨서 새로고침 — 홈·거래와 같은 공통 엔진·슬롯·문구 (docs/audit/mypage-ptr-2026-11-27).
 * 핸들러 = 프로필·주소(캐시 건너뜀) · 요약 숫자·배너 · 고객센터 안 읽음 — 병렬, 결과는 공통 집계(일부 실패 = 「일부만」).
 */
export const mypagePtrStore = createDibayPtrStore({ preflight: preflightMainHubPtrRefresh });

export function addMypagePullRefreshHandler(fn: DibayPtrHandler): () => void {
  return mypagePtrStore.addHandler(fn);
}

export function runMypagePullRefresh(releasePullPx = 0): Promise<DibayPtrRunResult> {
  return mypagePtrStore.run(releasePullPx);
}
