"use client";

import type { CommunityMessengerFriendRequest } from "@/lib/community-messenger/types";
import { BOTTOM_NAV_FIX_OFFSET_ABOVE_BOTTOM_CLASS } from "@/lib/main-menu/bottom-nav-config";
import { Sam } from "@/lib/ui/sam-component-classes";

type Props = {
  request: CommunityMessengerFriendRequest;
  busyId: string | null;
  onDismiss: () => void;
  onRespond: (requestId: string, action: "accept" | "reject") => void;
  /** `stack`: 전역 호스트가 여러 건을 세로로 쌓을 때(뷰포트 고정은 부모) */
  layout?: "viewport" | "stack";
};

/** 모바일 탭·스크린 리더 대비 최소 터치 높이 + 눌림 피드백 */
const MOBILE_PRESS =
  "touch-manipulation select-none transition-[transform,opacity] duration-100 will-change-transform active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100";

export function MessengerIncomingFriendRequestPopup({
  request,
  busyId,
  onDismiss,
  onRespond,
  layout = "viewport",
}: Props) {
  const busyAccept = busyId === `request:${request.id}:accept`;
  const busyReject = busyId === `request:${request.id}:reject`;
  const label = request.requesterLabel.trim() || "상대";
  const initial = label.slice(0, 1) || "?";
  const titleId = `messenger-incoming-fr-title-${request.id}`;
  const subtitleId = `messenger-incoming-fr-sub-${request.id}`;

  const outerClass =
    layout === "stack"
      ? "pointer-events-auto relative w-full max-w-lg shrink-0 self-center"
      : `pointer-events-auto fixed inset-x-0 z-[94] px-3 sm:px-4 ${BOTTOM_NAV_FIX_OFFSET_ABOVE_BOTTOM_CLASS}`;

  const panelClass =
    "relative mx-auto w-full max-w-[min(100%,22rem)] overflow-hidden rounded-2xl border border-sam-border bg-sam-surface text-sam-fg shadow-[0_12px_48px_rgba(15,23,42,0.18)] ring-1 ring-black/[0.05] sm:max-w-lg";

  return (
    <div
      className={outerClass}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={subtitleId}
    >
      <div className={panelClass}>
        <button
          type="button"
          onClick={onDismiss}
          className={`${Sam.btn.base} ${Sam.btn.ghostCombo} absolute right-2 top-2 z-[1] !h-11 !min-h-11 !w-11 !max-w-none shrink-0 rounded-full !border-0 !px-0 !py-0 text-sam-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sam-primary ${MOBILE_PRESS}`}
          aria-label="닫기"
        >
          <svg className="h-6 w-6 opacity-70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="flex gap-3 px-4 pb-1 pt-4 sm:px-5 sm:pt-5">
          <div
            className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-sam-primary-soft ring-2 ring-sam-surface shadow-md sam-text-body-lg font-semibold text-sam-primary"
            aria-hidden
          >
            {initial}
          </div>
          <div className="min-w-0 flex-1 pr-10 pt-0.5">
            <p id={titleId} className={`${Sam.text.bodyLg} font-semibold leading-snug text-sam-fg`}>
              {label}
            </p>
            <p id={subtitleId} className={`${Sam.text.bodySecondary} mt-1 leading-snug text-sam-fg/75`}>
              친구 요청을 보냈습니다
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-sam-border px-4 py-3 sm:px-5">
          <button
            type="button"
            disabled={busyAccept}
            onClick={() => onRespond(request.id, "accept")}
            className={`${Sam.btn.base} ${Sam.btn.primaryCombo} ${Sam.btn.block} min-h-[44px] rounded-xl px-4 font-semibold disabled:pointer-events-none ${MOBILE_PRESS}`}
          >
            {busyAccept ? "처리 중…" : "수락"}
          </button>
          <button
            type="button"
            disabled={busyReject}
            onClick={() => onRespond(request.id, "reject")}
            className={`${Sam.btn.base} ${Sam.btn.outlineCombo} ${Sam.btn.block} min-h-[44px] rounded-xl px-4 font-semibold disabled:pointer-events-none ${MOBILE_PRESS}`}
          >
            {busyReject ? "처리 중…" : "거절"}
          </button>
        </div>
      </div>
    </div>
  );
}
