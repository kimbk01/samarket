"use client";

import type { CallScreenViewModel } from "./call-ui.types";
import { CallAvatarHeader } from "./CallAvatarHeader";
import { CallControlBar } from "./CallControlBar";
import { CallPulseAnimation } from "./CallPulseAnimation";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";

/**
 * 음성 발신 벨 — 셸 전체 그라데이션(`CallScreen`) 위에 콘텐츠·하단 4버튼만 배치.
 */
export function OutgoingCallView({ vm }: { vm: CallScreenViewModel }) {
  const isStarbucks = vm.visualTheme === "starbucks";
  const peerName = vm.peerLabel.trim() || "?";
  /** 벨 ↔ 권한 전환 시 이전 레이아웃이 잠깐 겹쳐 보이지 않게 리마운트 */
  const layoutKey = vm.primaryActions.map((a) => a.id).join("|");

  return (
    <div
      key={layoutKey}
      className="relative z-[2] flex min-h-0 flex-1 flex-col overflow-hidden px-5 pb-[max(22px,calc(var(--safe-bottom)+10px))]"
    >
      <div
        className={`pointer-events-none absolute inset-0 ${
          isStarbucks
            ? "bg-[radial-gradient(circle_at_50%_14%,rgba(212,233,226,0.24),transparent_42%),radial-gradient(circle_at_50%_96%,rgba(241,248,244,0.08),transparent_38%)]"
            : "bg-[radial-gradient(circle_at_50%_14%,rgba(255,255,255,0.16),transparent_42%),radial-gradient(circle_at_50%_96%,rgba(255,255,255,0.06),transparent_38%)]"
        }`}
        aria-hidden
      />
      {vm.peerAvatarUrl ? (
        <div className="pointer-events-none absolute inset-0 opacity-20 blur-2xl" aria-hidden>
          <SamarketThumbnail
            src={vm.peerAvatarUrl}
            fill
            roundedClassName="rounded-none"
            className="scale-110 object-cover"
            fallbackSrc=""
          />
          <div className="absolute inset-0 bg-[#121212]/45" />
        </div>
      ) : null}
      <div className="relative flex min-h-0 flex-1 flex-col items-center">
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-2">
          <CallAvatarHeader
            name={peerName}
            avatarUrl={vm.peerAvatarUrl}
            status={vm.statusText}
            detail={vm.subStatusText}
          />
          <CallPulseAnimation className="mt-9" />
        </div>

        <div className="mt-auto w-full max-w-[400px] shrink-0 pb-1 pt-6">
          <CallControlBar
            primaryActions={vm.primaryActions}
            secondaryActions={vm.secondaryActions}
            theme={vm.visualTheme}
          />
        </div>
      </div>
    </div>
  );
}
