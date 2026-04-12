"use client";

import { useEffect, useState } from "react";

/**
 * 휴대망 끊김·복구 안내 — 메신저·거래 전역 체감 품질.
 */
export function WebConnectivityBanner() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  if (online) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] flex justify-center px-3 pt-[max(0.5rem,env(safe-area-inset-top))]"
    >
      <div className="pointer-events-auto max-w-lg rounded-full border border-sam-border-default bg-sam-warning-soft px-4 py-2 text-center text-sm text-sam-text-primary shadow-sm">
        인터넷 연결이 끊겼습니다. 복구되면 자동으로 동기화됩니다.
      </div>
    </div>
  );
}
