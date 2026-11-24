"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useRegisterOpenOverlay } from "@/lib/ui/use-register-open-overlay";

/**
 * 채팅 영상 전체 화면 재생(설계 §3-2). 누를 때만 열리고, 열릴 때만 영상 본문을 받는다(`preload="none"` + 사용자 탭 후 재생).
 * 영상 주소 = 메신저 조회 라우트(참가자 확인 → 7일 서명 URL 302) — 탐색(Range)은 Storage 로 직접 간다.
 * 뒤로 가기: 사진 뷰어(DibayImageViewer)와 같은 history 1칸 패턴 — 기기 뒤로·브라우저 뒤로가 뷰어만 닫는다.
 */

const HISTORY_KEY = "__dibayVideoViewer";

export function MessengerVideoViewer(props: {
  open: boolean;
  src: string;
  poster: string | null;
  onClose: () => void;
}) {
  const { open, src, poster, onClose } = props;
  useRegisterOpenOverlay(open);
  const { t } = useI18n();
  const [mounted, setMounted] = useState(false);
  const historyPushed = useRef(false);
  const closingFromPop = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) {
      if (historyPushed.current && !closingFromPop.current) {
        historyPushed.current = false;
        try {
          if (window.history.state?.[HISTORY_KEY]) window.history.back();
        } catch {
          /* ignore */
        }
      }
      closingFromPop.current = false;
      return;
    }
    if (!historyPushed.current) {
      try {
        window.history.pushState({ ...window.history.state, [HISTORY_KEY]: true }, "");
        historyPushed.current = true;
      } catch {
        /* ignore */
      }
    }
    const onPop = () => {
      if (!historyPushed.current) return;
      historyPushed.current = false;
      closingFromPop.current = true;
      onCloseRef.current();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [open]);

  useLayoutEffect(() => {
    if (!open || typeof document === "undefined") return;
    const html = document.documentElement;
    const body = document.body;
    const prev = { html: html.style.overflow, body: body.style.overflow };
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    return () => {
      html.style.overflow = prev.html;
      body.style.overflow = prev.body;
    };
  }, [open]);

  /* 닫을 때 재생·다운로드 중단(연결 끊기) — 남은 데이터 요청을 만들지 않는다 */
  useEffect(() => {
    if (open) return;
    const v = videoRef.current;
    if (!v) return;
    try {
      v.pause();
      v.removeAttribute("src");
      v.load();
    } catch {
      /* ignore */
    }
  }, [open]);

  if (!mounted || !open) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[2147483000] flex items-center justify-center bg-black"
      role="dialog"
      aria-modal="true"
      data-cm-video-viewer=""
    >
      <video
        ref={videoRef}
        src={src}
        poster={poster ?? undefined}
        controls
        autoPlay
        playsInline
        preload="none"
        className="max-h-full max-w-full"
        data-cm-video-player=""
      />
      <button
        type="button"
        onClick={() => onCloseRef.current()}
        className="absolute left-3 top-[max(0.75rem,var(--safe-top,0px))] flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white"
        aria-label={t("common_close")}
      >
        <X className="h-6 w-6" strokeWidth={2} aria-hidden />
      </button>
    </div>,
    document.body
  );
}
