import type { CSSProperties } from "react";
import { Sam } from "@/lib/ui/sam-component-classes";

/**
 * DIBAY 로딩 스피너 마크업 단일 정의 — React(`components/ui/DibaySpinner.tsx`)·DOM(메신저 진입 복사본) 공용.
 * 모양 CSS 는 `app/samarket-components.css` `.sam-spinner`.
 */
export type DibaySpinnerSize = "sm" | "md" | "lg";
export type DibaySpinnerTone = "surface" | "inverse" | "current";

export const DIBAY_SPINNER_DOTS = 12;
/** 한 바퀴 1.15s — 점마다 1.15s/12 씩 늦게 켜져 시계방향으로 돈다(옛 12점 링 4종 공통 주기) */
export const DIBAY_SPINNER_CYCLE_MS = 1150;

export type DibaySpinnerDotStyle = CSSProperties & { "--deg": string; "--delay": string };

export function dibaySpinnerDotStyle(i: number): DibaySpinnerDotStyle {
  return {
    "--deg": `${(i * 360) / DIBAY_SPINNER_DOTS}deg`,
    "--delay": `${((i * DIBAY_SPINNER_CYCLE_MS) / DIBAY_SPINNER_DOTS).toFixed(0)}ms`,
  };
}

export function dibaySpinnerClassName({
  size = "md",
  tone = "surface",
  spinning = true,
  className = "",
}: {
  size?: DibaySpinnerSize;
  tone?: DibaySpinnerTone;
  spinning?: boolean;
  className?: string;
}): string {
  return [
    Sam.spinner.base,
    Sam.spinner[size],
    tone === "inverse" ? Sam.spinner.inverse : tone === "current" ? Sam.spinner.current : "",
    spinning ? Sam.spinner.spin : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
}
