"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Monitor } from "lucide-react";
import type { CallScreenViewModel } from "./call-ui.types";
import { CallActionBar } from "./CallActionBar";
import { CallAvatar } from "./CallAvatar";
import { CallStatusText } from "./CallStatusText";
import { IncomingCallBrandHeader } from "./IncomingCallBrandHeader";
import { MiniLocalVideo } from "./MiniLocalVideo";
import { useCallTimer } from "./useCallTimer";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { logCallV4 } from "@/lib/community-messenger/call-v4/call-v4-debug";
import { showMessengerSnackbar } from "@/lib/community-messenger/stores/messenger-snackbar-store";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  CALL_PIP_MARGIN_BOTTOM_GAP_PX,
  clearCallPipActionBarHeightCssVar,
  syncCallPipActionBarHeightCssVar,
} from "@/lib/community-messenger/call-pip-metrics";
import { shouldAllowPipPointerInteraction } from "@/lib/community-messenger/call-video-layout";

const IDLE_HIDE_MS = 4200;

export function ConnectedVideoView({ vm }: { vm: CallScreenViewModel }) {
  const { t } = useI18n();
  const isStarbucks = vm.visualTheme === "starbucks";
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
  const actionBarMeasureRef = useRef<HTMLDivElement | null>(null);

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

  const telemetryCallId = vm.callTelemetryId?.trim() ?? "";

  useEffect(() => {
    if (!telemetryCallId) return;
    logCallV4("ConnectedVideoView_render", {
      callId: telemetryCallId,
      phase: vm.phase,
      mode: vm.mode,
      showRemoteVideo: Boolean(vm.showRemoteVideo),
      showLocalVideo: Boolean(vm.showLocalVideo),
      pipShellMounted: Boolean(vm.pipShellMounted),
    });
  }, [
    telemetryCallId,
    vm.phase,
    vm.mode,
    vm.showRemoteVideo,
    vm.showLocalVideo,
    vm.pipShellMounted,
  ]);

  useEffect(() => {
    if (!telemetryCallId || !vm.pipShellMounted || !vm.showLocalVideo) return;
    logCallV4("self_video_overlay_rendered", { callId: telemetryCallId });
  }, [telemetryCallId, vm.pipShellMounted, vm.showLocalVideo]);

  useEffect(() => {
    if (!telemetryCallId || vm.phase !== "connected") return;
    if (!vm.mainVideoSlot) {
      logCallV4("attach_remote_video_skipped", {
        callId: telemetryCallId,
        reason: "main_video_slot_missing",
        source: "connected_video_view",
        showRemoteVideo: Boolean(vm.showRemoteVideo),
      });
    }
  }, [telemetryCallId, vm.phase, vm.mainVideoSlot, vm.showRemoteVideo]);

  const pipShellMounted = Boolean(vm.pipShellMounted && vm.showLocalVideo && vm.miniVideoSlot);

  useEffect(() => {
    if (!pipShellMounted || typeof ResizeObserver === "undefined") return;

    let ro: ResizeObserver | null = null;
    let cancelled = false;
    let attempts = 0;

    const applyHeight = () => {
      const actionBarEl = actionBarMeasureRef.current;
      if (!actionBarEl) return;
      const h = controlsVisible
        ? Math.ceil(actionBarEl.getBoundingClientRect().height)
        : CALL_PIP_MARGIN_BOTTOM_GAP_PX + 8;
      if (h > 0) syncCallPipActionBarHeightCssVar(h);
    };

    const attach = () => {
      if (cancelled) return;
      const actionBarEl = actionBarMeasureRef.current;
      if (!actionBarEl) {
        attempts += 1;
        if (attempts < 90) requestAnimationFrame(attach);
        return;
      }
      applyHeight();
      ro = new ResizeObserver(applyHeight);
      ro.observe(actionBarEl);
    };

    attach();
    return () => {
      cancelled = true;
      ro?.disconnect();
    };
  }, [
    controlsVisible,
    pipShellMounted,
    vm.phase,
    vm.primaryActions.length,
    vm.secondaryActions?.length,
  ]);

  useEffect(() => {
    if (pipShellMounted) return;
    clearCallPipActionBarHeightCssVar();
  }, [pipShellMounted]);

  const revealControls = useCallback(() => {
    setControlsVisible(true);
    armIdleHideTimer();
  }, [armIdleHideTimer]);

  const outgoingVideoPipFirstHero = Boolean(vm.pipFirstOutgoingMainPlaceholder);

  /**
   * 솔로 상단 상태줄 — ringing/connecting pre-remote 만. connected 에서 발신 solo 금지.
   */
  const preRemoteDialingLayout =
    !outgoingVideoPipFirstHero &&
    vm.mode === "video" &&
    !vm.showRemoteVideo &&
    (vm.phase === "ringing" || vm.phase === "connecting") &&
    (vm.direction === "outgoing" ||
      (vm.direction === "incoming" && (vm.phase === "ringing" || vm.phase === "connecting")));

  /** connected · remote 아직 없음 — compact peer+timer 만 (발신 hero 재등장 금지). */
  const compactConnectedOverlay =
    vm.mode === "video" &&
    vm.phase === "connected" &&
    !vm.showRemoteVideo &&
    !outgoingVideoPipFirstHero;

  const showTopStatusDetail = vm.phase !== "connected";
  const detailLine = showTopStatusDetail ? (vm.connectionLabel ?? vm.subStatusText ?? null) : null;

  /** 발신 영상은 `CallHeader` 없음 — 오버레이만 safe-area 에 맞춤 */
  const outgoingVideoCompactTop =
    vm.mode === "video" && vm.direction === "outgoing" && !outgoingVideoPipFirstHero;
  const topOverlayPad = outgoingVideoCompactTop
    ? "pt-[max(8px,calc(env(safe-area-inset-top)+12px))]"
    : "pt-[max(8px,calc(env(safe-area-inset-top)+48px))]";

  /** 발신 영상은 중앙 대기 카드(아바타+검은 배경) 금지 — PiP-first pre-remote 는 예외 */
  const showAvatarCenterCard =
    !(vm.mode === "video" && vm.direction === "outgoing" && !outgoingVideoPipFirstHero) &&
    !vm.showRemoteVideo &&
    !preRemoteDialingLayout &&
    !compactConnectedOverlay &&
    !pipShellMounted &&
    !vm.showLocalVideo &&
    !outgoingVideoPipFirstHero;

  /** 영상 수신 벨·연결 중 — 카톡/텔레그램식 중앙 발신자 아바타 */
  const incomingVideoRingHero =
    vm.mode === "video" &&
    vm.direction === "incoming" &&
    (vm.phase === "ringing" || vm.phase === "connecting") &&
    !vm.showRemoteVideo;

  const liftIncomingRingingActions =
    vm.mode === "video" &&
    vm.direction === "incoming" &&
    (vm.phase === "ringing" || vm.phase === "connecting");
  const actionBarPaddingBottom = liftIncomingRingingActions
    ? "pb-[max(18px,calc(env(safe-area-inset-bottom,0px)+18px))]"
    : "pb-[max(14px,calc(env(safe-area-inset-bottom,0px)+8px))]";
  const actionBarPaddingTop = liftIncomingRingingActions ? "pt-14" : "pt-12";

  const pipAllowPointer = shouldAllowPipPointerInteraction({
    pipShellMounted,
    hasPipGestureBindings: Boolean(pipBindings?.onPipPointerDown),
  });
  /** PiP 영상은 항상 표시 — opacity-0 으로 전체를 숨기면 메인 검은 화면·터치 스왑에만 의존하게 됨 */
  const pipChromeHiddenClass = "";
  const pipInteractionClass = pipAllowPointer ? "pointer-events-auto touch-none" : "";

  const renderPip = () => {
    if (!pipShellMounted) return null;
    const bindings = pipBindings;
    const common = {
      label: bindings?.pipLabel ?? t("common_me"),
      widthPx: bindings?.widthPx,
      heightPx: bindings?.heightPx,
      style: bindings?.pipStyle ?? undefined,
      useAnchoredPosition: Boolean(bindings?.pipStyle),
      positionMode: bindings?.positionMode ?? "stage-absolute",
      micMuted: bindings?.micMuted ?? !vm.mediaState.micEnabled,
      cameraOff: bindings?.cameraOff ?? !vm.mediaState.cameraEnabled,
      onExpand: bindings?.onPipExpand,
      className: `${pipChromeHiddenClass} ${pipInteractionClass}`.trim(),
      onPointerDown: bindings?.onPipPointerDown,
      onPointerMove: bindings?.onPipPointerMove,
      onPointerUp: bindings?.onPipPointerUp,
      onPointerCancel: bindings?.onPipPointerCancel,
      theme: vm.visualTheme,
      children: vm.miniVideoSlot,
    };

    if (bindings) {
      return <MiniLocalVideo ref={bindings.pipRef} {...common} />;
    }
    return <MiniLocalVideo {...common} />;
  };

  return (
    <div className="relative z-[2] h-full min-h-0 w-full flex-1 basis-0 overflow-hidden">
      {/* 영상 전체 면 — 레이아웃 행으로 나뉘지 않고 뷰포트 높이만큼 채움 */}
      <div
        ref={(node) => {
          const stageRef = pipBindings?.stageRef;
          if (stageRef && "current" in stageRef) {
            stageRef.current = node;
          }
        }}
        className="absolute inset-0 h-full min-h-0"
      >
        <div className="absolute inset-0 z-0 h-full min-h-full bg-black [&_video]:pointer-events-none [&_video]:h-full [&_video]:min-h-full [&_video]:w-full [&_video]:object-cover [&_[id^=agora]]:h-full [&_[id^=agora]]:w-full">
          {vm.mainVideoSlot}
        </div>

        {(vm.showRemoteVideo || compactConnectedOverlay) ? (
          <div className={`pointer-events-none absolute inset-x-0 top-0 z-[4] flex justify-center px-4 ${topOverlayPad}`}>
            <div
              className={`max-w-[92vw] text-center ${
                isStarbucks
                  ? "drop-shadow-[0_2px_14px_rgba(0,61,41,0.48)]"
                  : "drop-shadow-[0_2px_14px_rgba(0,0,0,0.55)]"
              }`}
            >
              <div className={`sam-text-page-title font-semibold tracking-tight ${isStarbucks ? "text-[#F1F8F4]" : "text-white"}`}>
                {vm.peerLabel}
              </div>
              <div
                className={`mt-1 flex items-center justify-center gap-2 sam-text-body font-medium ${
                  isStarbucks ? "text-[#D4E9E2]/95" : "text-white/90"
                }`}
              >
                <span
                  className={
                    isStarbucks
                      ? "inline-flex h-2 w-2 rounded-full bg-[#D4E9E2] shadow-[0_0_0_4px_rgba(212,233,226,0.22)]"
                      : "inline-flex h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_0_4px_rgba(16,185,129,0.22)]"
                  }
                  aria-hidden
                />
                <span>{timer ?? vm.statusText}</span>
              </div>
              {compactConnectedOverlay && vm.connectionLabel ? (
                <p
                  className={`mt-1.5 inline-flex max-w-full items-center rounded-full px-2.5 py-0.5 sam-text-helper font-medium ${
                    isStarbucks
                      ? "bg-[#003D29]/52 text-[#D4E9E2]/88 ring-1 ring-[#D4E9E2]/16"
                      : "bg-black/35 text-white/72 ring-1 ring-white/12"
                  }`}
                >
                  {vm.connectionLabel}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        {preRemoteDialingLayout ? (
          <div className={`pointer-events-none absolute inset-x-0 top-0 z-[4] flex justify-center px-4 ${topOverlayPad}`}>
            <div
              className={`max-w-[92vw] text-center ${
                isStarbucks
                  ? "drop-shadow-[0_2px_14px_rgba(0,61,41,0.48)]"
                  : "drop-shadow-[0_2px_14px_rgba(0,0,0,0.55)]"
              }`}
            >
              {incomingVideoRingHero ? null : (
                <div
                  className={`sam-text-page-title font-semibold tracking-tight ${isStarbucks ? "text-[#F1F8F4]" : "text-white"}`}
                >
                  {vm.peerLabel}
                </div>
              )}
              <div
                className={`flex items-center justify-center gap-2 sam-text-body font-medium ${
                  incomingVideoRingHero ? "" : "mt-1"
                } ${isStarbucks ? "text-[#D4E9E2]/95" : "text-white/90"}`}
              >
                <span
                  className={
                    isStarbucks
                      ? "inline-flex h-2 w-2 animate-pulse rounded-full bg-[#CBA258] shadow-[0_0_0_4px_rgba(203,162,88,0.22)]"
                      : "inline-flex h-2 w-2 animate-pulse rounded-full bg-amber-300 shadow-[0_0_0_4px_rgba(251,191,36,0.22)]"
                  }
                  aria-hidden
                />
                <span>{timer ?? vm.statusText}</span>
              </div>
              {detailLine ? (
                <p
                  className={`mt-1.5 sam-text-body-secondary leading-snug ${
                    isStarbucks
                      ? "text-[#D4E9E2]/80 drop-shadow-[0_1px_10px_rgba(0,61,41,0.48)]"
                      : "text-white/72 drop-shadow-[0_1px_10px_rgba(0,0,0,0.5)]"
                  }`}
                >
                  {detailLine}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        {vm.showRemoteVideo ? (
          <div
            className={`absolute right-3 z-[8] ${
              outgoingVideoCompactTop
                ? "top-[max(10px,calc(env(safe-area-inset-top)+6px))]"
                : "top-[max(52px,calc(env(safe-area-inset-top)+40px))]"
            }`}
          >
            <button
              type="button"
              className={`flex h-11 w-11 items-center justify-center rounded-full backdrop-blur-md transition active:scale-[0.96] ${
                isStarbucks
                  ? "bg-[#003D29]/54 text-[#F1F8F4] ring-1 ring-[#D4E9E2]/24"
                  : "bg-black/40 text-white"
              }`}
              aria-label={t("cm_ui_participants")}
              onClick={() => showMessengerSnackbar(t("cm_ui_participant_invite_soon"))}
            >
              <Monitor size={22} />
            </button>
          </div>
        ) : null}

        {incomingVideoRingHero ? (
          <div className="pointer-events-none absolute inset-0 z-[5] flex flex-col items-center justify-center px-6 pb-[clamp(128px,18dvh,172px)] pt-[max(72px,calc(env(safe-area-inset-top)+64px))]">
            <div className="flex w-full max-w-md flex-col items-center text-center">
              <div className="mb-6 w-full pt-[max(8px,calc(env(safe-area-inset-top)+4px))]">
                <IncomingCallBrandHeader mode="video" visualTheme={vm.visualTheme} />
              </div>
              <CallAvatar label={vm.peerLabel} avatarUrl={vm.peerAvatarUrl} pulse theme={vm.visualTheme} />
              <h2
                className={`mt-6 text-center text-[clamp(1.35rem,5.5vw,2rem)] font-bold leading-tight tracking-tight ${
                  isStarbucks ? "text-[#F1F8F4]" : "text-white"
                }`}
              >
                {vm.peerLabel}
              </h2>
            </div>
          </div>
        ) : null}

        {outgoingVideoPipFirstHero ? (
          <div className="pointer-events-none absolute inset-0 z-[5] flex flex-col items-center justify-center px-6 pb-[clamp(128px,18dvh,172px)] pt-[max(72px,calc(env(safe-area-inset-top)+64px))]">
            <div className="flex w-full max-w-md flex-col items-center text-center">
              <CallAvatar label={vm.peerLabel} avatarUrl={vm.peerAvatarUrl} pulse theme={vm.visualTheme} />
              <h2
                className={`mt-6 text-center text-[clamp(1.35rem,5.5vw,2rem)] font-bold leading-tight tracking-tight ${
                  isStarbucks ? "text-[#F1F8F4]" : "text-white"
                }`}
              >
                {vm.peerLabel}
              </h2>
              <div
                className={`mt-3 flex items-center justify-center gap-2 sam-text-body font-medium ${
                  isStarbucks ? "text-[#D4E9E2]/95" : "text-white/90"
                }`}
              >
                <span
                  className={
                    isStarbucks
                      ? "inline-flex h-2 w-2 animate-pulse rounded-full bg-[#CBA258] shadow-[0_0_0_4px_rgba(203,162,88,0.22)]"
                      : "inline-flex h-2 w-2 animate-pulse rounded-full bg-amber-300 shadow-[0_0_0_4px_rgba(251,191,36,0.22)]"
                  }
                  aria-hidden
                />
                <span>{timer ?? vm.statusText}</span>
              </div>
              {detailLine && vm.phase !== "connected" ? (
                <p
                  className={`mt-2 sam-text-body-secondary leading-snug ${
                    isStarbucks
                      ? "text-[#D4E9E2]/80 drop-shadow-[0_1px_10px_rgba(0,61,41,0.48)]"
                      : "text-white/72 drop-shadow-[0_1px_10px_rgba(0,0,0,0.5)]"
                  }`}
                >
                  {detailLine}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        {showAvatarCenterCard ? (
          <div className="absolute inset-0 z-[4] flex flex-col items-center justify-center px-8">
            {vm.mode === "video" && vm.peerAvatarUrl ? (
              <SamarketThumbnail
                src={vm.peerAvatarUrl}
                size={96}
                roundedClassName="rounded-full"
                className={
                  isStarbucks
                    ? "mb-5 shadow-[0_8px_28px_rgba(0,61,41,0.38)] ring-2 ring-[#D4E9E2]/26"
                    : "mb-5 shadow-[0_8px_28px_rgba(0,0,0,0.45)] ring-2 ring-white/20"
                }
              />
            ) : vm.mode === "video" ? (
              <div
                className={`mb-5 flex h-24 w-24 shrink-0 items-center justify-center rounded-full text-[1.65rem] font-semibold uppercase tracking-wide ${
                  isStarbucks
                    ? "bg-[#D4E9E2]/18 text-[#F1F8F4] shadow-[0_8px_28px_rgba(0,61,41,0.38)] ring-2 ring-[#D4E9E2]/26"
                    : "bg-white/14 text-white shadow-[0_8px_28px_rgba(0,0,0,0.45)] ring-2 ring-white/22"
                }`}
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
            <CallStatusText
              title={vm.peerLabel}
              status={vm.statusText}
              timer={timer}
              detail={detailLine}
              signalTier={vm.connectionSignalTier ?? null}
            />
          </div>
        ) : null}
        {vm.participantsSummary ? (
          <div
            className={`absolute left-4 top-[calc(env(safe-area-inset-top)+52px)] z-[3] rounded-full px-3 py-1.5 sam-text-helper font-medium backdrop-blur-sm ${
              isStarbucks ? "bg-[#003D29]/45 text-[#F1F8F4] ring-1 ring-[#D4E9E2]/18" : "bg-black/30 text-white/90"
            }`}
          >
            {vm.participantsSummary}
          </div>
        ) : null}

        {/* 컨트롤 숨김 시 탭으로 복귀 — 보조 PiP(z-20) 아래 레이어 */}
        {autoHideControlsEnabled && !controlsVisible ? (
          <button
            type="button"
            className="absolute inset-0 z-[5] bg-transparent"
            aria-label={t("cm_ui_show_call_controls")}
            onClick={() => revealControls()}
          />
        ) : null}
      </div>

      {/* 보조 PiP — 하단 컨트롤(z-10) 위 터치 레이어 · stage 좌표계와 동일 inset-0 */}
      {pipShellMounted ? (
        <div className="pointer-events-none absolute inset-0 z-[15] min-h-0">{renderPip()}</div>
      ) : null}

      {/* 하단 컨트롤 — 영상 위 오버레이 · 숨김 시 아래로 슬라이드(translate-y-full), 표시 시 아래에서 올라옴 */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[10] overflow-hidden">
        <div
          ref={actionBarMeasureRef}
          className={`transition-transform duration-300 ease-out will-change-transform ${
            controlsVisible ? "pointer-events-auto translate-y-0" : "pointer-events-none translate-y-full"
          }`}
          onPointerDownCapture={() => {
            if (autoHideControlsEnabled) armIdleHideTimer();
          }}
        >
          <div
            className={`${
              isStarbucks
                ? "bg-gradient-to-t from-[#003D29]/96 via-[#006241]/58 to-transparent"
                : "bg-gradient-to-t from-black/95 via-black/55 to-transparent"
            } px-3 ${actionBarPaddingTop} ${actionBarPaddingBottom}`}
          >
            <CallActionBar actions={vm.primaryActions} theme={vm.visualTheme} />
            {vm.secondaryActions?.length ? (
              <div className="mt-4">
                <CallActionBar actions={vm.secondaryActions} compact theme={vm.visualTheme} />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
