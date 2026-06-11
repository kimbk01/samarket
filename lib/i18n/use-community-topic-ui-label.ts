"use client";

import { useMemo } from "react";
import type { AppLanguageCode } from "./config";
import { resolveCommunityTopicUILabel } from "./community-topic-label-i18n";

/** 피드·상세·마이허브 공통 — 주제 UI 라벨 (언어 전환 시 useMemo로 재계산 경계 고정) */
export function useCommunityTopicUILabel(
  lang: AppLanguageCode,
  koName: string,
  enName?: string | null,
  slug?: string
): string {
  return useMemo(
    () => resolveCommunityTopicUILabel(lang, koName, enName, slug),
    [lang, koName, enName, slug]
  );
}
