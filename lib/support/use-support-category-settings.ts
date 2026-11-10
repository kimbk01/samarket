"use client";

/**
 * 고객센터 문의 유형 어드민 설정 — 앱 쪽 1회 읽기 캐시 (접수형 3단계).
 * 첫 사용 때 `/api/support/category-settings` 를 한 번 읽고 공유한다. 실패 = 빈 설정(코드 기본값).
 */
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import {
  getSupportCategoryDefinition,
  listIssueTypesForCategory,
  type SupportAudience,
} from "@/lib/support/support-category-registry";
import {
  indexSupportCategorySettings,
  supportCategorySettingLabel,
  type SupportCategorySettingRow,
  type SupportCategorySettingsIndex,
} from "@/lib/support/support-category-settings";

const EMPTY: SupportCategorySettingsIndex = new Map();
let current: SupportCategorySettingsIndex = EMPTY;
let loadedAt = 0;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();
const TTL_MS = 5 * 60 * 1000;

function emit() {
  for (const l of listeners) l();
}

export function loadSupportCategorySettings(force = false): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (!force && loadedAt && Date.now() - loadedAt < TTL_MS) return Promise.resolve();
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch("/api/support/category-settings", { credentials: "include" });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; rows?: SupportCategorySettingRow[] } | null;
      if (res.ok && json?.ok && Array.isArray(json.rows)) {
        current = indexSupportCategorySettings(json.rows);
        loadedAt = Date.now();
        emit();
      }
    } catch {
      /* fail-soft — 코드 기본값 유지 */
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useSupportCategorySettings(): SupportCategorySettingsIndex {
  const index = useSyncExternalStore(
    subscribe,
    () => current,
    () => EMPTY
  );
  useEffect(() => {
    void loadSupportCategorySettings();
  }, []);
  return index;
}

/** 분야·세부 표시 이름 — 어드민 설정 이름(현재 언어) 우선, 없으면 코드 기본 이름 */
export function useSupportCategoryLabels() {
  const { t, language } = useI18n();
  const index = useSupportCategorySettings();
  const categoryLabel = useCallback(
    (audience: SupportAudience, categoryId: string | null | undefined): string => {
      if (!categoryId) return "";
      const custom = supportCategorySettingLabel(index, language, audience, categoryId);
      if (custom) return custom;
      const def = getSupportCategoryDefinition(categoryId);
      return t((def?.labelKey ?? "support_cat_other") as MessageKey);
    },
    [index, language, t]
  );
  const issueLabel = useCallback(
    (audience: SupportAudience, categoryId: string | null | undefined, issueId: string | null | undefined): string => {
      if (!categoryId || !issueId) return "";
      const custom = supportCategorySettingLabel(index, language, audience, categoryId, issueId);
      if (custom) return custom;
      const issue = listIssueTypesForCategory(categoryId).find((i) => i.id === issueId);
      return t((issue?.labelKey ?? "support_issue_other") as MessageKey);
    },
    [index, language, t]
  );
  return { index, categoryLabel, issueLabel };
}
