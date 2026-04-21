"use client";

import type { CallScreenViewModel } from "./call-ui.types";
import { CallActionBar } from "./CallActionBar";
import { CallAvatar } from "./CallAvatar";

/**
 * 음성 발신 벨(첨부 UI) — 상단 뒤로는 `CallHeader`, 보라 그라데이션·큰 아바타·이름·상태·하단 4버튼.
 */
export function OutgoingCallView({ vm }: { vm: CallScreenViewModel }) {
  const peerName = vm.peerLabel.trim() || "?";
  /** 벨 ↔ 권한 전환 시 이전 레이아웃이 잠깐 겹쳐 보이지 않게 리마운트 */
  const layoutKey = vm.primaryActions.map((a) => a.id).join("|");

  return (
    <div
      key={layoutKey}
      className="relative z-[2] flex min-h-0 min-h-[100dvh] flex-1 flex-col overflow-hidden bg-[linear-gradient(180deg,#6b3df1_0%,#5a35d8_28%,#3d2699_55%,#2a1a6e_100%)] px-5 pb-[max(22px,calc(env(safe-area-inset-bottom)+10px))]"
    >
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_14%,rgba(255,255,255,0.16),transparent_42%),radial-gradient(circle_at_50%_96%,rgba(255,255,255,0.06),transparent_38%)]"
        aria-hidden
      />
      <div className="relative flex min-h-0 flex-1 flex-col items-center">
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-2">
          <CallAvatar label={vm.peerLabel} avatarUrl={vm.peerAvatarUrl} pulse placeholderTone="outgoingVoice" />
          <h1 className="mt-8 text-center sam-text-hero font-bold tracking-tight text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.25)]">
            {peerName}
          </h1>
          <p className="mt-3 text-center sam-text-body-lg font-medium text-white/88 drop-shadow-[0_1px_8px_rgba(0,0,0,0.2)]">
            {vm.statusText}
          </p>
          {vm.subStatusText ? (
            <p className="mt-2 max-w-[300px] text-center sam-text-body-secondary leading-snug text-white/65">{vm.subStatusText}</p>
          ) : null}
        </div>

        <div className="mt-auto w-full max-w-[400px] shrink-0 pb-1 pt-6">
          <CallActionBar actions={vm.primaryActions} />
          {vm.secondaryActions?.length ? (
            <div className="mt-4">
              <CallActionBar actions={vm.secondaryActions} compact />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
