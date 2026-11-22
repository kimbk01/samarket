"use client";

import { useSyncExternalStore, type CSSProperties } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { translate } from "@/lib/i18n/messages";
import type { AppLanguageCode } from "@/lib/i18n/config";
import {
  getNetworkHealthServerState,
  getNetworkHealthState,
  subscribeNetworkHealth,
} from "@/lib/net/network-health.client";

/**
 * 오류 화면·오래 걸리는 대기 아래 한 줄 — 휴대폰 연결 문제일 때만(설계 §3-3 P2).
 * DIBAY 쪽 문제(`dibay_unreachable`)는 `includeDibay` 일 때만 보인다(대기 화면). 정상이면 아무것도 그리지 않는다.
 * `lang` 을 주면 언어 공급자 밖(`global-error`)에서도 쓴다.
 */
export function NetworkDeviceHint({
  className = "",
  style,
  includeDibay = false,
  lang,
}: {
  className?: string;
  /** `global-error` 처럼 CSS 가 안 올 수 있는 화면 */
  style?: CSSProperties;
  includeDibay?: boolean;
  lang?: AppLanguageCode;
}) {
  const { t } = useI18n();
  const health = useSyncExternalStore(subscribeNetworkHealth, getNetworkHealthState, getNetworkHealthServerState);
  const key =
    health === "device_offline"
      ? "net_device_offline"
      : health === "device_unstable"
        ? "net_device_unstable"
        : includeDibay && health === "dibay_unreachable"
          ? "net_dibay_unreachable"
          : null;
  if (!key) return null;
  return (
    <p className={className} style={style} role="status" data-network-hint={health}>
      {lang ? translate(lang, key) : t(key)}
    </p>
  );
}
