"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { isCallSurfaceTransitionPath } from "@/components/route-transition/call-surface-transition-path";
import {
  getNetworkHealthServerState,
  getNetworkHealthState,
  subscribeNetworkHealth,
  type NetworkHealthState,
} from "@/lib/net/network-health.client";
import type { MessageKey } from "@/lib/i18n/messages";

/**
 * 네트워크 안내 띠 — 설계 `docs/audit/loading-spinner-network-notice-design-2026-11-22.md` §3-3·§3-4 (P2).
 * 휴대폰 연결 문제(끊김·불안정)와 DIBAY 쪽 문제를 나눠 알린다. 판정은 `lib/net/network-health.client.ts`.
 *
 * 통화 화면은 예전 그대로(기기 `offline` 이벤트일 때 예전 문구만) — 통화 변경 규정(통화 화면 표시 무변경).
 */
const MESSAGE_BY_STATE: Record<Exclude<NetworkHealthState, "ok">, MessageKey> = {
  device_offline: "net_device_offline",
  device_unstable: "net_device_unstable",
  dibay_unreachable: "net_dibay_unreachable",
};

function useLegacyOnlineFlag(): boolean {
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
  return online;
}

export function WebConnectivityBanner() {
  const { t } = useI18n();
  const pathname = usePathname();
  const health = useSyncExternalStore(subscribeNetworkHealth, getNetworkHealthState, getNetworkHealthServerState);
  const legacyOnline = useLegacyOnlineFlag();

  let messageKey: MessageKey | null;
  if (isCallSurfaceTransitionPath(pathname)) {
    messageKey = legacyOnline ? null : "app_connectivity_offline";
  } else {
    messageKey = health === "ok" ? (legacyOnline ? null : "net_device_offline") : MESSAGE_BY_STATE[health];
  }
  if (!messageKey) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-network-notice={isCallSurfaceTransitionPath(pathname) ? "legacy" : health}
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] flex justify-center px-3 pt-[max(0.5rem,var(--safe-top))]"
    >
      <div className="pointer-events-auto max-w-lg rounded-full border border-[color:var(--overlay-border)] bg-[color:color-mix(in_srgb,#d4a017_10%,#fff)] px-4 py-2 text-center text-[length:var(--overlay-body-2-size)] font-medium text-[color:var(--overlay-warning)] shadow-[var(--overlay-elevation-1)]">
        {t(messageKey)}
      </div>
    </div>
  );
}
