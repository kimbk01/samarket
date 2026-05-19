"use client";

import { useEffect } from "react";
import { getAppSettings } from "@/lib/app-settings";

/**
 * 운영설정 localStorage 마이그레이션 트리거.
 * 브라우저 탭 제목은 Next metadata 가 단일 권한으로 관리한다.
 */
export function AppTitle() {
  useEffect(() => {
    void getAppSettings();
  }, []);

  return null;
}
