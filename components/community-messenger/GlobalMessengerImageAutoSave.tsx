"use client";

import { useMessengerImageAutoSaveGlobal } from "@/lib/community-messenger/attachment/use-messenger-image-auto-save-global";

/** 메신저 '미디어 자동 저장' 전역 실행기 — 네이티브·설정 ON·저장 지원일 때만 동작(그 외 비용 0). */
export function GlobalMessengerImageAutoSave() {
  useMessengerImageAutoSaveGlobal();
  return null;
}
