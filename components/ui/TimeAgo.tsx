"use client";

import { useEffect, useState } from "react";
import { formatTimeAgo } from "@/lib/utils/format";

/**
 * SSR/클라이언트에서 같은 값으로 첫 렌더 → Hydration 후 상대 시간 표시
 * (formatTimeAgo는 서버/클라이언트 시각이 달라 Hydration 오류를 유발하므로 사용)
 */
export function TimeAgo({ isoString }: { isoString: string }) {
  const [text, setText] = useState(() => {
    const d = new Date(isoString);
    return d.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
  });

  useEffect(() => {
    setText(formatTimeAgo(isoString));
  }, [isoString]);

  return <>{text}</>;
}
