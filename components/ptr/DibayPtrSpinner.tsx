"use client";

import type { CSSProperties } from "react";
import styles from "@/components/ptr/DibayPtrSpinner.module.css";

export type DibayPtrTone = "onBrand" | "onSurface" | "onGold";

type DotStyle = CSSProperties & { "--deg": string; "--delay": string };

const DOTS = 12;

/**
 * PTR 스피너 — `progress`(0~1) 결정형 점등(당기는 중) / `spinning` 무한 버퍼링(새로고침 중).
 * 상태 문구는 슬롯이 aria-live 로 전달하므로 스피너 자체는 `aria-hidden`.
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
  const lit = spinning ? 0 : Math.max(0, Math.min(DOTS, Math.ceil(progress * DOTS)));
  return (
    <span
      className={`${styles.container} ${styles[tone]} ${spinning ? styles.spin : ""} ${ready ? styles.ready : ""}`}
      data-ptr-spinner={spinning ? "spin" : "progress"}
      data-ptr-lit={spinning ? undefined : lit}
      aria-hidden
    >
      {Array.from({ length: DOTS }, (_, i) => {
        const style: DotStyle = {
          "--deg": `${(i * 360) / DOTS}deg`,
          "--delay": `${((i * 1150) / DOTS).toFixed(0)}ms`,
        };
        return <span key={i} className={`${styles.dot} ${i < lit ? styles.dotOn : ""}`} style={style} />;
      })}
    </span>
  );
}
