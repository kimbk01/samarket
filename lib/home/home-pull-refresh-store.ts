"use client";

import { createDibayPtrStore } from "@/lib/ui/ptr/create-dibay-ptr-store";
import { preflightMainHubPtrRefresh } from "@/lib/layout/main-hub-ptr-preflight";
import type { DibayPtrHandler, DibayPtrRunResult } from "@/lib/ui/ptr/dibay-ptr-ssot";

/**
 * 앱 홈(`/`·`/home`) 당겨서 새로고침 — 공통 엔진·슬롯·문구 그대로 (설계안 v11 §9).
 * 홈 구성·진행 중·열린 주제판 핸들러를 병렬 실행한다.
 */
export const homePtrStore = createDibayPtrStore({ preflight: preflightMainHubPtrRefresh });

export function addHomePullRefreshHandler(fn: DibayPtrHandler): () => void {
  return homePtrStore.addHandler(fn);
}

export function runHomePullRefresh(releasePullPx = 0): Promise<DibayPtrRunResult> {
  return homePtrStore.run(releasePullPx);
}
