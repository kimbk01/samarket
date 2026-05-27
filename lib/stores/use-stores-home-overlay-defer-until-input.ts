"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { isStoresHomeLcpPath } from "@/lib/stores/stores-home-lcp-policy";

/**
 * `/stores` cold LCP — SSR hero 고정 전 full-screen 오버레이 렌더·fetch 결과 UI 억제.
 * 첫 사용자 입력 전까지 LCP 후보가 hero gradient block 에 머물도록 한다.
 */
export function useStoresHomeOverlayDeferUntilInput(): boolean {
  const pathname = usePathname() ?? "";
  const isStoresHome = isStoresHomeLcpPath(pathname);
  const [inputSeen, setInputSeen] = useState(!isStoresHome);

  useEffect(() => {
    if (!isStoresHome) {
      setInputSeen(true);
      return;
    }
    setInputSeen(false);
    const unlock = () => setInputSeen(true);
    const opts: AddEventListenerOptions = { once: true, passive: true, capture: true };
    window.addEventListener("pointerdown", unlock, opts);
    window.addEventListener("keydown", unlock, opts);
    window.addEventListener("touchstart", unlock, opts);
    window.addEventListener("wheel", unlock, opts);
    return () => {
      window.removeEventListener("pointerdown", unlock, opts);
      window.removeEventListener("keydown", unlock, opts);
      window.removeEventListener("touchstart", unlock, opts);
      window.removeEventListener("wheel", unlock, opts);
    };
  }, [isStoresHome]);

  return isStoresHome && !inputSeen;
}
