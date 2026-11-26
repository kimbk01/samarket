"use client";

import { ChevronRight, Phone } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DIBAY_SERVICE_BRAND } from "@/lib/brand/dibay-service-brand";

/** 홈 telRING 칸 줄 수 (최근 통화 3개) */
export const HOME_TELRING_RECENT_ROWS = 3;

/**
 * telRING 칸의 제목 줄 안쪽(아이콘 · 브랜드 · 제목 · 화살표).
 * 통화 모듈을 쓰지 않아 홈 첫 그림에 같이 들어간다 — 칸 코드를 불러오는 동안에도 같은 제목을 그린다.
 */
export function HomeTelringHeadContent() {
  const { t } = useI18n();
  const brand = DIBAY_SERVICE_BRAND.LETARING;
  const ringAt = brand.indexOf("RING");
  return (
    <>
      <span className="home-tel-head-ic" aria-hidden>
        <Phone className="h-[18px] w-[18px]" strokeWidth={2.4} />
      </span>
      <span className="home-tel-head-title">
        {ringAt > 0 ? (
          <>
            {brand.slice(0, ringAt)}
            <span className="home-tel-ring">{brand.slice(ringAt)}</span>
          </>
        ) : (
          brand
        )}{" "}
        {t("home_telring_recent_title")}
      </span>
      <ChevronRight className="home-tel-head-chev" strokeWidth={2.4} aria-hidden />
    </>
  );
}

/** 불러오는 중 회색 줄 3개 */
export function HomeTelringSkeletonList() {
  return (
    <ul className="home-tel-list" aria-busy="true">
      {Array.from({ length: HOME_TELRING_RECENT_ROWS }, (_, i) => (
        <li key={i} className="home-tel-row home-tel-row--skel">
          <span className="home-tel-avatar home-skel" />
          <span className="home-tel-skel-line home-skel" />
        </li>
      ))}
    </ul>
  );
}

/**
 * 칸 코드를 불러오는 동안의 자리 — 빈 흰 칸 대신 같은 제목 + 회색 줄
 * (2026-11-26 Xiaomi 실측: 홈이 그려진 뒤 약 0.5초 제목 없는 빈 칸).
 */
export function HomeTelringPlaceholder() {
  return (
    <section className="home-tel" aria-busy="true">
      <div className="home-tel-head" aria-hidden>
        <HomeTelringHeadContent />
      </div>
      <HomeTelringSkeletonList />
    </section>
  );
}
