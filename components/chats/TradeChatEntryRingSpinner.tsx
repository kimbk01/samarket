import type { CSSProperties } from "react";
import styles from "@/components/chats/TradeChatEntryRingSpinner.module.css";

type DotStyle = CSSProperties & { "--deg": string; "--delay": string };

const DOTS = 12;

export function TradeChatEntryRingSpinner({ className = "" }: { className?: string }) {
  return (
    <div
      className={`${styles.container} ${className}`}
      role="status"
      aria-label="로딩 중"
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
