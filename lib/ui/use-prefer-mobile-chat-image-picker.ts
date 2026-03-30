"use client";

import { useEffect, useState } from "react";

/**
 * 모바일·태블릿(거친 포인터 또는 좁은 너비)에서 채팅 이미지 선택 확인 시트를 쓸지 여부.
 */
export function usePreferMobileChatImagePicker(): boolean {
  const [prefer, setPrefer] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = window.matchMedia("(max-width: 1023px), (pointer: coarse)");
    const apply = () => setPrefer(q.matches);
    apply();
    q.addEventListener("change", apply);
    return () => q.removeEventListener("change", apply);
  }, []);

  return prefer;
}
