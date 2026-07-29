"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type AnimationEvent as ReactAnimationEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useMessengerSplitDetailOverride } from "@/components/community-messenger/MessengerSplitDetailOverrideContext";
import { useIsMessengerSplitViewport } from "@/hooks/use-is-messenger-split-viewport";

type Props = {
  open: boolean;
  onClosed: () => void;
  children: ReactNode;
};

const CommunityMessengerCallPeerDetailCloseContext = createContext<(() => void) | null>(null);

export function useCommunityMessengerCallPeerDetailClose(): (() => void) | null {
  return useContext(CommunityMessengerCallPeerDetailCloseContext);
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return reduced;
}

/** 통화 상대 상세 — <768: body portal · ≥768: 우측 split pane 임베드 */
export function CommunityMessengerCallPeerDetailShell({ open, onClosed, children }: Props) {
  const reducedMotion = usePrefersReducedMotion();
  const isWide = useIsMessengerSplitViewport();
  const detailOverride = useMessengerSplitDetailOverride();
  const setDetailOverride = detailOverride?.setDetailOverride;
  const [mounted, setMounted] = useState(open);
  const [portalReady, setPortalReady] = useState(false);
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (open) {
      closingRef.current = false;
      setClosing(false);
      setMounted(true);
      return;
    }
    if (!mounted || closingRef.current) return;
    closingRef.current = true;
    if (reducedMotion) {
      setMounted(false);
      onClosed();
      return;
    }
    setClosing(true);
  }, [open, mounted, onClosed, reducedMotion]);

  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    if (reducedMotion) {
      setMounted(false);
      onClosed();
      return;
    }
    setClosing(true);
  }, [onClosed, reducedMotion]);

  const finishClose = useCallback(() => {
    setMounted(false);
    setClosing(false);
    onClosed();
  }, [onClosed]);

  const onAnimationEnd = useCallback(
    (e: ReactAnimationEvent<HTMLDivElement>) => {
      if (e.target !== e.currentTarget) return;
      if (!closing) return;
      finishClose();
    },
    [closing, finishClose]
  );

  useLayoutEffect(() => {
    if (!isWide || !setDetailOverride) return;
    if (!mounted) {
      setDetailOverride(null);
      return;
    }
    const surfaceClassName = [
      closing ? "messenger-call-peer-detail-anim-exit" : "messenger-call-peer-detail-anim-enter",
      reducedMotion ? "messenger-call-peer-detail-anim-reduced" : "",
    ]
      .filter(Boolean)
      .join(" ");
    setDetailOverride(
      <div
        className={`pointer-events-auto flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-sam-app ${surfaceClassName}`}
        onAnimationEnd={onAnimationEnd}
        data-call-peer-detail-shell="pane"
      >
        <CommunityMessengerCallPeerDetailCloseContext.Provider value={requestClose}>
          {children}
        </CommunityMessengerCallPeerDetailCloseContext.Provider>
      </div>
    );
  }, [
    children,
    closing,
    isWide,
    mounted,
    onAnimationEnd,
    reducedMotion,
    requestClose,
    setDetailOverride,
  ]);

  useEffect(() => {
    if (!isWide || !setDetailOverride) return;
    return () => {
      setDetailOverride(null);
    };
  }, [isWide, setDetailOverride]);

  if (isWide) {
    return null;
  }

  if (!mounted || !portalReady) return null;

  const overlayClassName = [
    "pointer-events-auto fixed inset-0 z-[1280] flex h-dvh max-h-dvh flex-col overflow-hidden bg-sam-app",
    closing ? "messenger-call-peer-detail-anim-exit" : "messenger-call-peer-detail-anim-enter",
    reducedMotion ? "messenger-call-peer-detail-anim-reduced" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return createPortal(
    <div
      className={overlayClassName}
      onAnimationEnd={onAnimationEnd}
      data-call-peer-detail-shell="overlay"
    >
      <CommunityMessengerCallPeerDetailCloseContext.Provider value={requestClose}>
        {children}
      </CommunityMessengerCallPeerDetailCloseContext.Provider>
    </div>,
    document.body
  );
}
