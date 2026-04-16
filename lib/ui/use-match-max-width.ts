"use client";

import { useEffect, useState } from "react";

/** Tailwind `md` (768px) 미만 — 모바일·좁은 창에서 메신저 방 뷰포트 보정에 사용 */
export function useMatchMaxWidthMd(): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const apply = () => setMatches(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  return matches;
}
