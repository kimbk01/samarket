"use client";

import { useSyncExternalStore, type CSSProperties } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayPtrSpinner, type DibayPtrTone } from "@/components/ptr/DibayPtrSpinner";
import type { DibayPtrSnapshot } from "@/lib/ui/ptr/create-dibay-ptr-store";
import {
  DIBAY_PTR_COLLAPSE_MS,
  DIBAY_PTR_THRESHOLD_PX,
  resolveDibayPtrHintHeightPx,
} from "@/lib/ui/ptr/dibay-ptr-ssot";
import type { MessageKey } from "@/lib/i18n/message-key";

export type DibayPtrSlotStore = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => DibayPtrSnapshot;
  getServerSnapshot: () => DibayPtrSnapshot;
};

const TONE_TEXT_CLASS: Record<DibayPtrTone, string> = {
  onBrand: "text-white/92",
  onSurface: "text-[color:var(--sector-header-title-color,#243832)]",
  onGold: "text-[#362415]",
};

function phaseMessageKey(snap: DibayPtrSnapshot): MessageKey | null {
  switch (snap.phase) {
    case "PULLING":
      return "ptr_pull_hint";
    case "READY":
      return "ptr_release";
    case "REFRESHING":
      return "ptr_refreshing";
    case "SUCCESS":
      return "ptr_result_success";
    case "ERROR":
      return snap.outcome?.partial ? "ptr_result_partial" : "ptr_result_error";
    default:
      return null;
  }
}

/** 스크린리더 낭독 — 당김 중 매 프레임 갱신 방지, 의미 있는 상태 전환만 */
function announceKey(snap: DibayPtrSnapshot): MessageKey | null {
  if (snap.phase === "PULLING" || snap.phase === "IDLE" || snap.phase === "CANCELLED") return null;
  return phaseMessageKey(snap);
}

/**
 * DIBAY PTR 힌트 슬롯 — 공통 UI SSOT (거래·커뮤니티·메신저·배달 홈·browse).
 * 높이 = `pullPx`(당김) / 유지 높이(새로고침·결과). 헤더 1·2단 기하는 건드리지 않음.
 * 배경은 호출부(`className`)가 소유 — 도메인 크롬 색 유지.
 */
export function DibayPtrSlot({
  store,
  tone,
  className = "",
  dataAttribute,
}: {
  store: DibayPtrSlotStore;
  tone: DibayPtrTone;
  className?: string;
  /** 기존 테스트·QA 셀렉터 보존 (예: `data-trade-market-ptr-hint`) */
  dataAttribute: string;
}) {
  const { t } = useI18n();
  const snap = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const holding = snap.phase === "REFRESHING" || snap.phase === "SUCCESS" || snap.phase === "ERROR";
  const hintHeightPx = holding ? snap.pullPx : resolveDibayPtrHintHeightPx(snap);
  const visible = hintHeightPx > 0;
  const transitionMs =
    snap.refreshing ? 180 : hintHeightPx === 0 ? DIBAY_PTR_COLLAPSE_MS : 120;
  const messageKey = phaseMessageKey(snap);
  const liveKey = announceKey(snap);
  const showSpinner =
    snap.phase === "PULLING" || snap.phase === "READY" || snap.phase === "REFRESHING";
  const textClass = TONE_TEXT_CLASS[tone];
  const attrs = { [dataAttribute]: "" };

  return (
    <div
      {...attrs}
      data-ptr-phase={snap.phase}
      className={`w-full overflow-hidden text-center [transition-property:height,opacity] [transition-duration:var(--ptr-dur)] [transition-timing-function:var(--ptr-ease)] motion-reduce:[transition-duration:0ms] ${className}`}
      style={
        {
          height: `${hintHeightPx}px`,
          opacity: visible ? 1 : 0,
          /* 인라인 transition-* 는 motion-reduce 클래스를 덮으므로 변수로만 전달 */
          "--ptr-dur": `${transitionMs}ms`,
          "--ptr-ease": snap.refreshing ? "ease-out" : "cubic-bezier(0.33, 1, 0.68, 1)",
        } as CSSProperties
      }
    >
      <div className="flex h-full min-h-0 flex-col items-center justify-center gap-1.5 px-4 py-1" aria-hidden>
        {showSpinner ?
          <DibayPtrSpinner
            tone={tone}
            spinning={snap.phase === "REFRESHING"}
            progress={snap.pullPx / DIBAY_PTR_THRESHOLD_PX}
            ready={snap.phase === "READY"}
          />
        : null}
        {messageKey ?
          <p className={`line-clamp-2 text-[13px] font-medium leading-snug ${textClass}`}>{t(messageKey)}</p>
        : null}
      </div>
      <span className="sr-only" role="status" aria-live="polite">
        {liveKey ? t(liveKey) : ""}
      </span>
    </div>
  );
}
