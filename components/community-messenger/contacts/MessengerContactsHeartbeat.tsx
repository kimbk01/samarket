"use client";

import { useEffect } from "react";
import { getBoundAuthUserId } from "@/lib/auth/client-instance-id";

/**
 * 메신저 진입 시 연락처 기기 사용 갱신 + 6시간 1회 비교 (SSOT v5 G-3 · §7).
 * - 이 기기에서 동의한 회원만 (기기 저장값으로 판정 → 동의 전 회원은 요청 0).
 * - 메신저 bootstrap·Realtime 과 무관: 첫 화면이 다 그려진 뒤(8초 후 · 유휴 시간) 엔진을 따로 불러온다(번들 분리).
 * - 앱이 아니거나 연락처 플러그인 없는 바이너리면 엔진이 아무것도 하지 않는다.
 */
const LOCAL_PREFIX = "dibay:cm-contacts:v1:";

export function MessengerContactsHeartbeat() {
  useEffect(() => {
    const userId = getBoundAuthUserId();
    if (!userId) return;
    let consented = false;
    try {
      const raw = window.localStorage.getItem(LOCAL_PREFIX + userId);
      consented = Boolean(raw && (JSON.parse(raw) as { consented?: boolean }).consented);
    } catch {
      consented = false;
    }
    if (!consented) return;
    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      void import("@/lib/community-messenger/contacts/contacts-sync-engine").then((m) => {
        if (!cancelled) void m.runContactsSync(userId);
      });
    };
    const timer = window.setTimeout(() => {
      const ric = (window as unknown as { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
      if (ric) ric(run);
      else run();
    }, 8000);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);
  return null;
}
