"use client";

import type { CSSProperties } from "react";
import styles from "@/components/chats/TradeChatEntryRingSpinner.module.css";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

type DotStyle = CSSProperties & { "--deg": string; "--delay": string };

const DOTS = 12;

export function TradeChatEntryRingSpinner({ className = "" }: { className?: string }) {
  const { t } = useI18n();
  return (
    <div
      className={`${styles.container} ${className}`}
      role="status"
      aria-label={t("chats_spinner_loading_aria")}
    >
      {Array.from({ length: DOTS }, (_, i) => {
        const deg = (i * 360) / DOTS;
        const delayMs = (-(i * 1150) / DOTS).toFixed(0);
        const style: DotStyle = {
          "--deg": `${deg}deg`,
          "--delay": `${delayMs}ms`,
        };
        return <span key={i} className={styles.dot} style={style} />;
      })}
    </div>
  );
}
