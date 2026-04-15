"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronUp, Mic, MicOff, Minus, Phone, PhoneOff, Square, Video, VideoOff, X } from "lucide-react";
import type { CallScreenViewModel } from "./call-ui.types";
import { CallAvatar } from "./CallAvatar";
import { showMessengerSnackbar } from "@/lib/community-messenger/stores/messenger-snackbar-store";

/**
 * Incoming ringing only — desktop-style window (window controls + four actions).
 * No slide-to-accept; accept/decline are explicit buttons.
 */
export function IncomingCallView({ vm }: { vm: CallScreenViewModel }) {
  const accept = vm.primaryActions.find((a) => a.icon === "accept" || a.tone === "accept") ?? null;
  const decline = vm.primaryActions.find((a) => a.icon === "decline" || a.tone === "danger") ?? null;

  const windowRef = useRef<HTMLDivElement>(null);
  const [maximized, setMaximized] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [videoOn, setVideoOn] = useState(() => vm.mode === "video");

  useEffect(() => {
    const onFs = () => {
      setMaximized(document.fullscreenElement === windowRef.current);
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const toggleMaximize = useCallback(async () => {
    const el = windowRef.current;
    if (!el) return;
    try {
      if (!document.fullscreenElement) {
        await el.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      showMessengerSnackbar("전체 화면을 바꾸지 못했습니다.", { variant: "error" });
    }
  }, []);

  const peerName = vm.peerLabel.trim() || "?";
  const statusLine = `${peerName}님이 전화를 걸고 있습니다…`;

  const actionCircleBase =
    "relative flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full transition active:scale-[0.96] disabled:opacity-40";
  const gearBadgeClass =
    "absolute -right-0.5 -top-0.5 z-[1] flex h-[18px] w-[18px] items-center justify-center rounded-full bg-zinc-700 text-white shadow ring-1 ring-black/40 hover:bg-zinc-600";

  return (
    <div className="relative z-[2] flex min-h-0 flex-1 flex-col bg-black/55 px-3 pb-[max(16px,env(safe-area-inset-bottom))] pt-2 backdrop-blur-[2px]">
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center">
        <div
          ref={windowRef}
          data-incoming-call-window
          className={
            maximized
              ? "flex h-full w-full max-h-none max-w-none flex-col rounded-none border-0 bg-[#121214]"
              : "flex max-h-[min(640px,90dvh)] w-full max-w-[400px] flex-col overflow-hidden rounded-[20px] border border-white/12 bg-[#121214] shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
          }
        >
          <div className="flex shrink-0 items-center justify-end gap-0.5 px-3 pt-[max(10px,env(safe-area-inset-top))] pb-2">
            <button
              type="button"
              onClick={() => vm.onBack?.()}
              className="flex h-9 w-9 items-center justify-center rounded-md text-zinc-400 transition hover:bg-white/10 hover:text-white"
              aria-label="최소화"
            >
              <Minus size={18} strokeWidth={2.2} />
            </button>
            <button
              type="button"
              onClick={() => void toggleMaximize()}
              className="flex h-9 w-9 items-center justify-center rounded-md text-zinc-400 transition hover:bg-white/10 hover:text-white"
              aria-label={maximized ? "전체 화면 축소" : "전체 화면"}
            >
              <Square size={15} strokeWidth={2.2} />
            </button>
            <button
              type="button"
              onClick={() => {
                if (decline && !decline.disabled) decline.onClick();
              }}
              disabled={decline?.disabled}
              className="flex h-9 w-9 items-center justify-center rounded-md text-zinc-400 transition hover:bg-white/10 hover:text-white disabled:opacity-40"
              aria-label="닫기"
            >
              <X size={19} strokeWidth={2.2} />
            </button>
          </div>

          <div className="flex min-h-0 flex-1 flex-col items-center px-6 pb-6 pt-2">
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center">
              <div className="scale-[1.08]">
                <CallAvatar label={vm.peerLabel} avatarUrl={vm.peerAvatarUrl} pulse placeholderTone="orange" />
              </div>
              <h2 className="mt-8 text-center text-[22px] font-bold tracking-tight text-white">{peerName}</h2>
              <p className="mt-2 max-w-[280px] text-center text-[15px] leading-snug text-zinc-400">{statusLine}</p>
              {vm.subStatusText ? (
                <p className="mt-3 max-w-[300px] text-center text-[12px] text-amber-200/90">{vm.subStatusText}</p>
              ) : null}
            </div>

            <div className="mt-4 flex w-full max-w-[360px] items-start justify-between gap-1 px-0 sm:gap-2">
              <div className="flex flex-1 flex-col items-center gap-2">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      if (vm.mode !== "video") {
                        showMessengerSnackbar("음성 통화에서는 영상을 켤 수 없습니다.");
                        return;
                      }
                      setVideoOn((v) => !v);
                    }}
                    disabled={vm.mode !== "video"}
                    className={`${actionCircleBase} ${
                      vm.mode !== "video"
                        ? "bg-zinc-600 text-white opacity-50"
                        : videoOn
                          ? "bg-zinc-700 text-white"
                          : "bg-white text-zinc-900"
                    }`}
                    aria-label={videoOn ? "영상 끄기" : "영상 시작"}
                  >
                    {videoOn ? <Video size={22} /> : <VideoOff size={22} />}
                  </button>
                  <button
                    type="button"
                    className={gearBadgeClass}
                    onClick={() =>
                      showMessengerSnackbar("카메라 장치는 통화 연결 후 설정에서 바꿀 수 있습니다.")
                    }
                    aria-label="영상 장치"
                  >
                    <ChevronUp size={11} strokeWidth={3} className="-mt-px" />
                  </button>
                </div>
                <span className="text-center text-[11px] font-medium text-zinc-400">
                  {videoOn ? "영상 끄기" : "영상 시작"}
                </span>
              </div>

              <div className="flex flex-1 flex-col items-center gap-2">
                <button
                  type="button"
                  disabled={decline?.disabled}
                  onClick={() => decline?.onClick()}
                  className={`${actionCircleBase} bg-[#ef4444] text-white shadow-[0_10px_28px_rgba(239,68,68,0.45)]`}
                  aria-label="거절"
                >
                  <PhoneOff size={22} />
                </button>
                <span className="text-center text-[11px] font-medium text-zinc-400">거절</span>
              </div>

              <div className="flex flex-1 flex-col items-center gap-2">
                <button
                  type="button"
                  disabled={accept?.disabled}
                  onClick={() => accept?.onClick()}
                  className={`${actionCircleBase} bg-[#22c55e] text-white shadow-[0_10px_28px_rgba(34,197,94,0.45)]`}
                  aria-label="수락"
                >
                  <Phone size={22} className="-rotate-[35deg]" />
                </button>
                <span className="text-center text-[11px] font-medium text-zinc-400">수락</span>
              </div>

              <div className="flex flex-1 flex-col items-center gap-2">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setMicMuted((m) => !m)}
                    className={`${actionCircleBase} bg-zinc-700 text-white`}
                    aria-label={micMuted ? "음소거 해제" : "음소거"}
                  >
                    {micMuted ? <MicOff size={22} /> : <Mic size={22} />}
                  </button>
                  <button
                    type="button"
                    className={gearBadgeClass}
                    onClick={() =>
                      showMessengerSnackbar("마이크는 통화 연결 후 설정에서 바꿀 수 있습니다.")
                    }
                    aria-label="마이크 장치"
                  >
                    <ChevronUp size={11} strokeWidth={3} className="-mt-px" />
                  </button>
                </div>
                <span className="text-center text-[11px] font-medium text-zinc-400">
                  {micMuted ? "음소거 해제" : "음소거"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
