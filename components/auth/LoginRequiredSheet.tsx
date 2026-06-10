"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AuthModal } from "@/components/auth/AuthModal";
import {
  DIBAY_LOGIN_REQUIRED_DISMISS_EVENT,
  DIBAY_LOGIN_REQUIRED_EVENT,
  type LoginRequiredDetail,
} from "@/lib/auth/require-auth-action";

export function LoginRequiredSheet() {
  const pathname = usePathname();
  const [detail, setDetail] = useState<LoginRequiredDetail | null>(null);
  const prevPathnameRef = useRef<string | null>(null);

  const close = useCallback(() => {
    setDetail(null);
  }, []);

  useEffect(() => {
    const onRequired = (event: Event) => {
      const ce = event as CustomEvent<LoginRequiredDetail>;
      setDetail(ce.detail ?? null);
    };
    window.addEventListener(DIBAY_LOGIN_REQUIRED_EVENT, onRequired as EventListener);
    return () => window.removeEventListener(DIBAY_LOGIN_REQUIRED_EVENT, onRequired as EventListener);
  }, []);

  useEffect(() => {
    const onDismiss = () => close();
    window.addEventListener(DIBAY_LOGIN_REQUIRED_DISMISS_EVENT, onDismiss);
    return () => window.removeEventListener(DIBAY_LOGIN_REQUIRED_DISMISS_EVENT, onDismiss);
  }, [close]);

  /** 마운트 직후 닫지 않음 — 탭 이동 시에만 닫기(자동 오픈 레이스 방지) */
  useEffect(() => {
    if (prevPathnameRef.current === null) {
      prevPathnameRef.current = pathname;
      return;
    }
    if (prevPathnameRef.current === pathname) return;
    prevPathnameRef.current = pathname;
    close();
  }, [pathname, close]);

  return <AuthModal open={detail != null} detail={detail} onClose={close} />;
}
