"use client";

import { useEffect, useState } from "react";

/** localStorage override — SSR false → 클라이언트 마운트 후에만 라우팅 분기 */
export function useCallV3ClientReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(true);
  }, []);
  return ready;
}
