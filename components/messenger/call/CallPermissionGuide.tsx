"use client";

import type { CommunityMessengerCallKind } from "@/lib/community-messenger/types";
import {
  getCommunityMessengerPermissionGuide,
  openCommunityMessengerPermissionSettings,
} from "@/lib/community-messenger/call-permission";

export type CallPermissionGuideProps = {
  kind: CommunityMessengerCallKind;
  className?: string;
  onRetry?: () => void;
};

/** 권한 거부·재시도 안내 — 브라우저 기본 프롬프트와 겹치지 않게 카피 최소화 */
export function CallPermissionGuide(props: CallPermissionGuideProps) {
  const { kind, className, onRetry } = props;
  const g = getCommunityMessengerPermissionGuide(kind);
  return (
    <div className={className ?? "space-y-3 text-sm text-zinc-200"}>
      <p className="leading-relaxed text-zinc-300">{g.description}</p>
      <div className="flex flex-wrap gap-2">
        {onRetry ? (
          <button
            type="button"
            className="rounded-lg bg-white/10 px-3 py-2 font-medium text-white transition hover:bg-white/15"
            onClick={() => onRetry()}
          >
            {g.retryLabel}
          </button>
        ) : null}
        <button
          type="button"
          className="rounded-lg border border-white/15 px-3 py-2 font-medium text-zinc-200 transition hover:bg-white/5"
          onClick={() => {
            if (!openCommunityMessengerPermissionSettings()) {
              /* 브라우저별 설정 URL 미지원 — 상위에서 스낵바 처리 가능 */
            }
          }}
        >
          {g.settingsLabel}
        </button>
      </div>
    </div>
  );
}
