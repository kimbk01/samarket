"use client";

import { useEffect } from "react";
import { getAppSettings, hydrateAppSettingsFromPublicApi } from "@/lib/app-settings";

/**
 * 운영설정 서버 동기화 트리거.
 * 브라우저 탭 제목은 Next metadata 가 단일 권한으로 관리한다.
 */
export function AppTitle() {
  useEffect(() => {
    void hydrateAppSettingsFromPublicApi().then(() => {
      void getAppSettings();
    });
  }, []);

  return null;
}
