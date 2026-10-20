"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";

export type AdminMockToolKind = "backup" | "dr" | "automation" | "production_migration";

const NOTICE_KEY: Record<AdminMockToolKind, MessageKey> = {
  backup: "admin_mock_tool_notice_backup",
  dr: "admin_mock_tool_notice_dr",
  automation: "admin_mock_tool_notice_automation",
  production_migration: "admin_mock_tool_notice_production_migration",
};

/**
 * 설계 v4 §8 — 모의 화면(백업/복구 · DR · 자동화 · 프로덕션 전환) 페이지 상단 표기.
 * 표시 전용: 도구 동작은 바꾸지 않는다.
 */
export function AdminMockToolNotice({ tool }: { tool: AdminMockToolKind }) {
  const { t } = useI18n();
  return (
    <div
      data-admin-mock-tool-notice={tool}
      role="note"
      className="mb-4 rounded-ui-rect border border-amber-500/40 bg-amber-500/10 px-4 py-3 sam-text-body font-medium text-sam-fg"
    >
      {t(NOTICE_KEY[tool])}
    </div>
  );
}
