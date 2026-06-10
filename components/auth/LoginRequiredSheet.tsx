"use client";

import { useCallback, useEffect, useState } from "react";
import { AuthModal } from "@/components/auth/AuthModal";
import {
  DIBAY_LOGIN_REQUIRED_EVENT,
  type LoginRequiredDetail,
} from "@/lib/auth/require-auth-action";

export function LoginRequiredSheet() {
  const [detail, setDetail] = useState<LoginRequiredDetail | null>(null);

  useEffect(() => {
    const onRequired = (event: Event) => {
      const ce = event as CustomEvent<LoginRequiredDetail>;
      setDetail(ce.detail ?? null);
    };
    window.addEventListener(DIBAY_LOGIN_REQUIRED_EVENT, onRequired as EventListener);
    return () => window.removeEventListener(DIBAY_LOGIN_REQUIRED_EVENT, onRequired as EventListener);
  }, []);

  const close = useCallback(() => {
    setDetail(null);
  }, []);

  return <AuthModal open={detail != null} detail={detail} onClose={close} />;
}
