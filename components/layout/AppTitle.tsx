"use client";

import { useEffect } from "react";
import { getAppSettings } from "@/lib/app-settings";

/** 어드민 일반 설정의 사이트명을 document.title에 반영 */
export function AppTitle() {
  useEffect(() => {
    const name = getAppSettings().siteName?.trim();
    if (name) document.title = name;
  }, []);
  return null;
}
