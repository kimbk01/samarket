"use client";

import type { CSSProperties } from "react";
import styles from "./VoiceMessageBufferingSpinner.module.css";

const BUFFER_DOTS = 12;

export function VoiceMessageBufferingSpinner({
  light,
  label,
}: {
  light: boolean;
  label: string;
}) {
  return (
    <span
      className={`${styles.container} ${light ? styles.containerLight : ""}`}
      role="status"
      aria-label={label}
    >
      {Array.from({ length: BUFFER_DOTS }, (_, i) => {
        const deg = (i * 360) / BUFFER_DOTS;
        const delayMs = (i * 95).toFixed(0);
        return (
          <span
            key={i}
            className={`${styles.dot} ${light ? styles.dotLight : ""}`}
            style={
              {
                "--deg": `${deg}deg`,
                "--delay": `${delayMs}ms`,
              } as CSSProperties
            }
            aria-hidden
          />
        );
      })}
    </span>
  );
}
