"use client";

import { useEffect, useRef, useState } from "react";
import { DIBAY_PERMISSION_SESSION_STORAGE_KEY_PREFIX } from "@/lib/permissions/device-permission-session-prefix";

/** localStorage/sessionStorage 기반 임시 캐시 삭제, 삭제 완료 토스트 */
export function CacheSettingsContent() {
  const [toast, setToast] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = () => {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith("cache_") || key.startsWith("temp_"))) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));
      const preservedSession: Array<[string, string]> = [];
      try {
        for (let i = 0; i < sessionStorage.length; i++) {
          const key = sessionStorage.key(i);
          if (key?.startsWith(DIBAY_PERMISSION_SESSION_STORAGE_KEY_PREFIX)) {
            preservedSession.push([key, sessionStorage.getItem(key) ?? ""]);
          }
        }
      } catch {
        /* ignore */
      }
      sessionStorage.clear();
      for (const [k, v] of preservedSession) {
        try {
          sessionStorage.setItem(k, v);
        } catch {
          /* quota / private mode */
        }
      }
    } catch {
      // ignore
    }
    setToast((prev) => (prev ? prev : true));
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = setTimeout(() => {
      setToast((prev) => (prev ? false : prev));
      toastTimerRef.current = null;
    }, 2000);
  };

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  return (
    <div className="space-y-4">
      <p className="sam-text-body text-sam-muted">
        임시 캐시를 삭제하여 저장 공간을 확보합니다.
      </p>
      <button
        type="button"
        onClick={clear}
        className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-2 sam-text-body font-medium text-sam-fg hover:bg-sam-app"
      >
        캐시 삭제
      </button>
      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 rounded-ui-rect bg-sam-ink px-4 py-2 sam-text-body text-white shadow-sam-elevated">
          삭제되었습니다.
        </div>
      )}
    </div>
  );
}
