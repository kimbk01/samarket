"use client";

import styles from "@/components/ptr/DibayPtrSpinner.module.css";
import { Sam } from "@/lib/ui/sam-component-classes";
import {
  DIBAY_SPINNER_DOTS,
  dibaySpinnerClassName,
  dibaySpinnerDotStyle,
} from "@/lib/ui/dibay-spinner-markup";

export type DibayPtrTone = "onBrand" | "onSurface" | "onGold";

/**
 * PTR 스피너 — DIBAY 스피너 단일 정의(`.sam-spinner` md 24px, `lib/ui/dibay-spinner-markup.ts`)와 같은 모양.
 * PTR 에만 있는 동작: `progress`(0~1) 당기는 정도만큼 점이 켜짐 → `spinning` 무한 회전(새로고침 중).
 * 색은 슬롯 배경 대비용 tone(머리글 바탕)만 모듈에 둔다. 상태 문구는 슬롯이 aria-live 로 전달 → 스피너는 `aria-hidden`.
 */
export function DibayPtrSpinner({
  tone,
  progress = 0,
  spinning = false,
  ready = false,
}: {
  tone: DibayPtrTone;
  progress?: number;
  spinning?: boolean;
  ready?: boolean;
}) {
  const lit = spinning ? 0 : Math.max(0, Math.min(DIBAY_SPINNER_DOTS, Math.ceil(progress * DIBAY_SPINNER_DOTS)));
  return (
    <span
      className={`${dibaySpinnerClassName({ size: "md", spinning })} ${styles.container} ${styles[tone]} ${ready ? styles.ready : ""}`}
      data-ptr-spinner={spinning ? "spin" : "progress"}
      data-ptr-lit={spinning ? undefined : lit}
      aria-hidden
    >
      {Array.from({ length: DIBAY_SPINNER_DOTS }, (_, i) => (
        <span
          key={i}
          className={`${Sam.spinner.dot} ${!spinning && i < lit ? Sam.spinner.dotOn : ""}`}
          style={dibaySpinnerDotStyle(i)}
        />
      ))}
    </span>
  );
}
