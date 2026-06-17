"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type AnimationEvent as ReactAnimationEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

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

/** 통화 상대 상세 — 440ms 우→좌 슬라이드 오버레이 (body portal, CSS animation) */
export function CommunityMessengerCallPeerDetailShell({ open, onClosed, children }: Props) {
  const reducedMotion = usePrefersReducedMotion();
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

  const onAnimationEnd = useCallback(
    (e: ReactAnimationEvent<HTMLDivElement>) => {
      if (e.target !== e.currentTarget) return;
      if (!closing) return;
      setMounted(false);
      setClosing(false);
      onClosed();
    },
    [closing, onClosed]
  );

  if (!mounted || !portalReady) return null;

  const surfaceClassName = [
    "pointer-events-auto fixed inset-0 z-[1280] flex h-dvh max-h-dvh flex-col overflow-hidden bg-sam-app",
    closing ? "messenger-call-peer-detail-anim-exit" : "messenger-call-peer-detail-anim-enter",
    reducedMotion ? "messenger-call-peer-detail-anim-reduced" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return createPortal(
    <div
      className={surfaceClassName}
      onAnimationEnd={onAnimationEnd}
      data-call-peer-detail-shell="true"
    >
      <CommunityMessengerCallPeerDetailCloseContext.Provider value={requestClose}>
        {children}
      </CommunityMessengerCallPeerDetailCloseContext.Provider>
    </div>,
    document.body
  );
}
