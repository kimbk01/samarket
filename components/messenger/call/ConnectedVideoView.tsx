"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Monitor } from "lucide-react";
import type { CallScreenViewModel } from "./call-ui.types";
import { CallActionBar } from "./CallActionBar";
import { CallStatusText } from "./CallStatusText";
import { MiniLocalVideo } from "./MiniLocalVideo";
import { useCallTimer } from "./useCallTimer";
import { showMessengerSnackbar } from "@/lib/community-messenger/stores/messenger-snackbar-store";

const IDLE_HIDE_MS = 4200;

export function ConnectedVideoView({ vm }: { vm: CallScreenViewModel }) {
  const timer = useCallTimer({
    connectedAt: vm.connectedAt,
    endedAt: vm.endedAt,
    endedDurationSeconds: vm.endedDurationSeconds,
  });

  const pipBindings = vm.videoPipLayout;

  /** 통화 연결 후에만 자동 숨김 — 벨·연결 중에는 항상 표시 */
  const autoHideControlsEnabled = vm.phase === "connected";

  const [controlsVisible, setControlsVisible] = useState(true);
  const idleHideTimerRef = useRef<number | null>(null);

  const clearIdleHideTimer = useCallback(() => {
    if (idleHideTimerRef.current != null) {
      clearTimeout(idleHideTimerRef.current);
      idleHideTimerRef.current = null;
    }
  }, []);

  const armIdleHideTimer = useCallback(() => {
    clearIdleHideTimer();
    if (!autoHideControlsEnabled) return;
    const t = window.setTimeout(() => {
      setControlsVisible(false);
      idleHideTimerRef.current = null;
    }, IDLE_HIDE_MS);
    idleHideTimerRef.current = t;
  }, [autoHideControlsEnabled, clearIdleHideTimer]);

  useEffect(() => {
    if (!autoHideControlsEnabled) {
      clearIdleHideTimer();
      setControlsVisible(true);
      return;
    }
    setControlsVisible(true);
    armIdleHideTimer();
    return clearIdleHideTimer;
  }, [autoHideControlsEnabled, vm.phase, armIdleHideTimer, clearIdleHideTimer]);

  const revealControls = useCallback(() => {
    setControlsVisible(true);
    armIdleHideTimer();
  }, [armIdleHideTimer]);

  const outgoingSoloVideoLayout =
    vm.mode === "video" &&
    !vm.showRemoteVideo &&
    !vm.showLocalVideo &&
    (vm.direction === "outgoing" ||
      (vm.direction === "incoming" &&
        (vm.phase === "ringing" || vm.phase === "connecting" || vm.phase === "connected")));
  const detailLine = vm.connectionLabel ?? vm.subStatusText ?? null;

  const liftIncomingRingingActions =
    vm.mode === "video" &&
    vm.direction === "incoming" &&
    (vm.phase === "ringing" || vm.phase === "connecting");
  const actionBarPaddingBottom = liftIncomingRingingActions
    ? "pb-[max(1.25rem,calc(env(safe-area-inset-bottom,0px)+min(5.75rem,22dvh)))]"
    : "pb-[max(14px,calc(env(safe-area-inset-bottom,0px)+8px))]";
  const actionBarPaddingTop = liftIncomingRingingActions ? "pt-10" : "pt-12";

  const pipCornerExtra =
    vm.showLocalVideo && pipBindings && !pipBindings.pipPixelStyle && autoHideControlsEnabled && !controlsVisible
      ? "!bottom-5"
      : "";

  return (
    <div className="relative z-[2] min-h-0 w-full flex-1 overflow-hidden">
      {/* 영상 전체 면 — 레이아웃 행으로 나뉘지 않고 뷰포트 높이만큼 채움 */}
      <div ref={pipBindings?.stageRef} className="absolute inset-0 min-h-0">
        <div className="absolute inset-0 z-0 min-h-full [&_video]:pointer-events-none [&_video]:min-h-full [&_video]:w-full [&_video]:object-cover">
          {vm.mainVideoSlot}
        </div>

        {vm.showRemoteVideo ? (
          <div className="pointer-events-none absolute inset-x-0 top-0 z-[4] flex justify-center px-4 pt-[max(8px,calc(env(safe-area-inset-top)+48px))]">
            <div className="max-w-[92vw] text-center drop-shadow-[0_2px_14px_rgba(0,0,0,0.55)]">
              <div className="sam-text-page-title font-semibold tracking-tight text-white">{vm.peerLabel}</div>
              <div className="mt-1 flex items-center justify-center gap-2 sam-text-body font-medium text-white/90">
                <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_0_4px_rgba(16,185,129,0.22)]" aria-hidden />
                <span>{timer ?? vm.statusText}</span>
              </div>
            </div>
          </div>
        ) : null}

        {outgoingSoloVideoLayout ? (
          <div className="pointer-events-none absolute inset-x-0 top-0 z-[4] flex justify-center px-4 pt-[max(8px,calc(env(safe-area-inset-top)+48px))]">
            <div className="max-w-[92vw] text-center drop-shadow-[0_2px_14px_rgba(0,0,0,0.55)]">
              {vm.hideOutgoingVideoBrandRow ? null : (
                <div className="flex items-center justify-center gap-2 text-white/95">
                  <span className="min-w-0 truncate sam-text-body font-medium tracking-tight">사마켓 영상 통화…</span>
                </div>
              )}
              <div
                className={`sam-text-page-title font-semibold tracking-tight text-white ${vm.hideOutgoingVideoBrandRow ? "" : "mt-3"}`}
              >
                {vm.peerLabel}
              </div>
              <div className="mt-1 flex items-center justify-center gap-2 sam-text-body font-medium text-white/90">
                <span
                  className={
                    vm.phase === "connected"
                      ? "inline-flex h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_0_4px_rgba(16,185,129,0.22)]"
                      : "inline-flex h-2 w-2 animate-pulse rounded-full bg-amber-300 shadow-[0_0_0_4px_rgba(251,191,36,0.22)]"
                  }
                  aria-hidden
                />
                <span>{timer ?? vm.statusText}</span>
              </div>
              {detailLine ? (
                <p className="mt-1.5 sam-text-body-secondary leading-snug text-white/72 drop-shadow-[0_1px_10px_rgba(0,0,0,0.5)]">
                  {detailLine}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        {vm.showRemoteVideo ? (
          <div className="absolute right-3 top-[max(52px,calc(env(safe-area-inset-top)+40px))] z-[8]">
            <button
              type="button"
              className="flex h-11 w-11 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-md transition active:scale-[0.96]"
              aria-label="참가자"
              onClick={() => showMessengerSnackbar("참가자 초대는 준비 중입니다.")}
            >
              <Monitor size={22} />
            </button>
          </div>
        ) : null}

        {!vm.showRemoteVideo && !outgoingSoloVideoLayout && !vm.showLocalVideo ? (
          <div className="absolute inset-0 z-[4] flex flex-col items-center justify-center px-8">
            {vm.mode === "video" && vm.peerAvatarUrl ? (
              <img
                src={vm.peerAvatarUrl}
                alt=""
                className="mb-5 h-24 w-24 shrink-0 rounded-full object-cover shadow-[0_8px_28px_rgba(0,0,0,0.45)] ring-2 ring-white/20"
              />
            ) : vm.mode === "video" ? (
              <div
                className="mb-5 flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-white/14 text-[1.65rem] font-semibold uppercase tracking-wide text-white shadow-[0_8px_28px_rgba(0,0,0,0.45)] ring-2 ring-white/22"
                aria-hidden
              >
                {(() => {
                  const t = vm.peerLabel.trim();
                  if (!t) return "?";
                  const first = [...t][0];
                  return first && first !== " " ? first.toUpperCase() : "?";
                })()}
              </div>
            ) : null}
            <CallStatusText title={vm.peerLabel} status={vm.statusText} timer={timer} detail={detailLine} />
          </div>
        ) : null}
        {vm.showLocalVideo && pipBindings ? (
          <MiniLocalVideo
            ref={pipBindings.pipRef}
            label={pipBindings.pipLabel}
            minimized
            useFreePosition={Boolean(pipBindings.pipPixelStyle)}
            style={pipBindings.pipPixelStyle ?? undefined}
            className={pipCornerExtra}
            onPointerDown={pipBindings.onPipPointerDown}
            onPointerMove={pipBindings.onPipPointerMove}
            onPointerUp={pipBindings.onPipPointerUp}
            onPointerCancel={pipBindings.onPipPointerCancel}
          >
            {vm.miniVideoSlot}
          </MiniLocalVideo>
        ) : vm.showLocalVideo ? (
          <MiniLocalVideo label="나" minimized={vm.mediaState.localVideoMinimized} className={pipCornerExtra}>
            {vm.miniVideoSlot}
          </MiniLocalVideo>
        ) : null}
        {vm.participantsSummary ? (
          <div className="absolute left-4 top-[calc(env(safe-area-inset-top)+52px)] z-[3] rounded-full bg-black/30 px-3 py-1.5 sam-text-helper font-medium text-white/90 backdrop-blur-sm">
            {vm.participantsSummary}
          </div>
        ) : null}

        {/* 컨트롤 숨김 시 탭으로 복귀 — PiP(z-6)·헤더 버튼(z-8) 아래 레이어 */}
        {autoHideControlsEnabled && !controlsVisible ? (
          <button
            type="button"
            className="absolute inset-0 z-[5] bg-transparent"
            aria-label="통화 버튼 표시"
            onClick={() => revealControls()}
          />
        ) : null}
      </div>

      {/* 하단 컨트롤 — 영상 위 오버레이 · 숨김 시 아래로 슬라이드(translate-y-full), 표시 시 아래에서 올라옴 */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[10] overflow-hidden">
        <div
          className={`transition-transform duration-300 ease-out will-change-transform ${
            controlsVisible ? "pointer-events-auto translate-y-0" : "pointer-events-none translate-y-full"
          }`}
          onPointerDownCapture={() => {
            if (autoHideControlsEnabled) armIdleHideTimer();
          }}
        >
          <div
            className={`bg-gradient-to-t from-black/95 via-black/55 to-transparent px-3 ${actionBarPaddingTop} ${actionBarPaddingBottom}`}
          >
            <CallActionBar actions={vm.primaryActions} />
            {vm.secondaryActions?.length ? (
              <div className="mt-4">
                <CallActionBar actions={vm.secondaryActions} compact />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
