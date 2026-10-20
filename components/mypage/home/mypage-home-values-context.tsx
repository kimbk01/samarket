"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { CurrencyAmount } from "@/components/currency";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MypageHomeSummaryState } from "@/lib/mypage/mypage-home-summary-client";
import {
  mypageHomeCountRowProps,
  resolveMypageHomeCountValue,
  resolveMypageHomeOffersHref,
  resolveMypageHomePointsValue,
} from "@/lib/mypage/mypage-home-row-values";
import type { MypageHomeRowValueSource } from "@/lib/mypage/mypage-home-menu-types";
import type { MyInfoMenuBadge, MyInfoMenuValueState } from "@/components/mypage/myinfo/MyInfoMenuItem";
import {
  formatInstalledVersionLabel,
  formatWebDeployShaLabel,
} from "@/lib/platform/format-installed-version-label";
import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";

/**
 * 내정보 홈 오른쪽 값 공급 — 로그인 홈 대시보드만 Provider 를 둔다.
 * 비로그인 홈(같은 섹션 컴포넌트 재사용)은 Provider 없음 → 값 슬롯 없음(v2.1 `:241`).
 */
export type MypageHomeValues = {
  summary: MypageHomeSummaryState | null;
  /** 거래 채팅 안읽음 — 허브 배지 스토어(`chatUnread`), 추가 요청 0 */
  tradeChatUnread: number;
  /** 대표 동네 공개 라벨 — 홈 모델 주소 기본값 1회 조회 결과 */
  addressPublicLabel: string | null;
};

const MypageHomeValuesContext = createContext<MypageHomeValues | null>(null);

export function MypageHomeValuesProvider({ value, children }: { value: MypageHomeValues; children: ReactNode }) {
  return <MypageHomeValuesContext.Provider value={value}>{children}</MypageHomeValuesContext.Provider>;
}

export type MypageHomeRowValueProps = {
  value?: ReactNode;
  valueState?: MyInfoMenuValueState;
  badge?: MyInfoMenuBadge;
};

/** 설치 앱 `버전 (빌드)` · 웹 = 배포 SHA 7자리 (S18 과 같은 포맷 함수) */
function useInstalledVersionLabel(enabled: boolean): string | null {
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    if (!isCapacitorNativePlatform()) {
      setLabel(formatWebDeployShaLabel(process.env.NEXT_PUBLIC_WEB_DEPLOY_SHA));
      return;
    }
    void import("@/lib/platform/android-play-in-app-update")
      .then((m) => m.getCapacitorAppInstalledVersion())
      .then((info) => {
        if (cancelled || !info) return;
        setLabel(formatInstalledVersionLabel(info.versionName, info.versionCode));
      })
      .catch(() => {
        /* 값 없음 = 비움 */
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return label;
}

/**
 * 행 목적지 — `hrefSource` 가 있으면 summary 값으로 정한다(S23 가격 제안 탭). Provider 밖이면 기본 href.
 */
export function useMypageHomeRowHref(defaultHref: string, hrefSource: "offers-tab" | undefined): string {
  const ctx = useContext(MypageHomeValuesContext);
  if (hrefSource !== "offers-tab") return defaultHref;
  return resolveMypageHomeOffersHref(ctx?.summary ?? null);
}

/** 행 값 출처 → `MyRow` props. Provider 밖(비로그인)이면 빈 객체. */
export function useMypageHomeRowValue(source: MypageHomeRowValueSource | undefined): MypageHomeRowValueProps {
  const ctx = useContext(MypageHomeValuesContext);
  const { t } = useI18n();
  const versionLabel = useInstalledVersionLabel(Boolean(ctx) && source?.kind === "installed-version");

  return useMemo<MypageHomeRowValueProps>(() => {
    if (!ctx || !source) return {};
    switch (source.kind) {
      case "summary-count": {
        const v = resolveMypageHomeCountValue(ctx.summary, source.field);
        const key =
          source.format === "selling"
            ? "mypage_home_value_selling"
            : source.format === "pending"
              ? "mypage_home_value_offers_pending"
              : source.format === "active"
                ? "mypage_home_value_orders_active"
                : source.format === "sheets"
                  ? "mypage_home_value_sheets"
                  : "mypage_home_value_count";
        return mypageHomeCountRowProps(v, (count) => t(key, { count }));
      }
      case "summary-points": {
        const v = resolveMypageHomePointsValue(ctx.summary);
        if (v.kind === "loading") return { valueState: "loading" };
        if (v.kind === "unknown") return { value: t("mypage_home_value_unknown"), valueState: "ready" };
        return {
          value: <CurrencyAmount currency="point" amount={v.amount} compactPoint />,
          valueState: "ready",
        };
      }
      case "trade-chat-unread":
        return ctx.tradeChatUnread > 0 ? { badge: { count: ctx.tradeChatUnread, tone: "danger" } } : {};
      case "address-public-label":
        return ctx.addressPublicLabel ? { value: ctx.addressPublicLabel, valueState: "ready" } : {};
      case "installed-version":
        return versionLabel ? { value: versionLabel, valueState: "ready" } : {};
      default:
        return {};
    }
  }, [ctx, source, t, versionLabel]);
}
