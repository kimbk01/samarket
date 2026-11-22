"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { Sam } from "@/lib/ui/sam-component-classes";
import {
  DIBAY_SPINNER_DOTS,
  dibaySpinnerClassName,
  dibaySpinnerDotStyle,
  type DibaySpinnerSize,
  type DibaySpinnerTone,
} from "@/lib/ui/dibay-spinner-markup";

export type { DibaySpinnerSize, DibaySpinnerTone };

/**
 * DIBAY 로딩 스피너 단일 정의 — 12점 링 (`app/samarket-components.css` `.sam-spinner`).
 * 설계: `docs/audit/loading-spinner-network-notice-design-2026-11-22.md` §3-1.
 *
 * - size: sm 16px(버튼 안·목록 줄) · md 24px(목록 끝·이미지 칸·새로고침) · lg 44px(화면 본문 대기)
 * - tone: surface(밝은 바탕) · inverse(사진·영상·진한 바탕) · current(감싼 글자색, 버튼 안)
 * - decorative: 이미 상태 문구·aria 가 있는 곳(버튼 라벨 등) — 스크린리더에 다시 읽히지 않게 숨긴다
 */
export function DibaySpinner({
  size = "md",
  tone = "surface",
  label,
  decorative = false,
  className = "",
}: {
  size?: DibaySpinnerSize;
  tone?: DibaySpinnerTone;
  /** 스크린리더 문구 — 없으면 「로딩 중」 */
  label?: string;
  decorative?: boolean;
  className?: string;
}) {
  const { t } = useI18n();
  const a11y = decorative
    ? ({ "aria-hidden": true } as const)
    : ({ role: "status", "aria-label": label ?? t("chats_spinner_loading_aria") } as const);
  return (
    <span className={dibaySpinnerClassName({ size, tone, className })} data-dibay-spinner={size} {...a11y}>
      {Array.from({ length: DIBAY_SPINNER_DOTS }, (_, i) => (
        <span key={i} className={Sam.spinner.dot} style={dibaySpinnerDotStyle(i)} aria-hidden />
      ))}
    </span>
  );
}

/**
 * 화면·영역 대기 — 빈 화면 대신 가운데 큰 스피너. 450ms(`LOADING_SPINNER_APPEAR_DELAY_MS`) 뒤에만 보인다.
 * - layout="page": 본문 자리(최소 높이 50dvh)
 * - layout="fill": 감싼 상자를 가득 채움(시트·지도·덮개 안)
 * - layout="block": 목록 영역(최소 높이 11rem — 옛 배달 목록 대기와 같은 높이)
 * - layout="inline": 시트·카드 안 작은 대기(위아래 여백만) — 옛 「불러오는 중…」 글자 자리
 */
export function DibayPendingSpinner({
  layout = "page",
  tone = "surface",
  className = "",
}: {
  layout?: "page" | "fill" | "block" | "inline";
  tone?: DibaySpinnerTone;
  className?: string;
}) {
  const box =
    layout === "fill"
      ? "absolute inset-0"
      : layout === "block"
        ? "min-h-[11rem] w-full"
        : layout === "inline"
          ? "w-full py-6"
          : "min-h-[50dvh] w-full";
  return (
    <div
      className={`flex items-center justify-center ${box} ${className}`}
      aria-busy="true"
      data-dibay-pending-spinner={layout}
    >
      <span className={Sam.spinner.appear}>
        <DibaySpinner size="lg" tone={tone} />
      </span>
    </div>
  );
}
