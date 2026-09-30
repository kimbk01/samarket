"use client";

import { AdminCard } from "@/components/admin/AdminCard";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

/**
 * R16 Intro menu contract only.
 * Runtime / editor = NOT_IMPLEMENTED. Hard OFF. Fake ON forbidden.
 */
export function IntroAdminStubPage() {
  const { safeT } = useI18n();

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title={safeT("admin_intro_stub_title", {
          fallbackKo: "Intro",
          fallbackEn: "Intro",
        })}
        description={safeT("admin_intro_stub_desc", {
          fallbackKo: "OS 시작 화면과 완전히 분리된 메뉴입니다. 이번 단계에서는 구현되지 않습니다.",
          fallbackEn:
            "Completely separate from OS start screen. Not implemented in this phase.",
        })}
      />

      <AdminCard>
        <div className="space-y-3">
          <div className="sam-text-body text-sam-fg">
            {safeT("admin_intro_stub_usage", {
              fallbackKo: "Intro 사용",
              fallbackEn: "Intro enabled",
            })}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled
              aria-pressed="false"
              className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-2 sam-text-body text-sam-muted opacity-70"
            >
              OFF
            </button>
            <button
              type="button"
              disabled
              aria-disabled="true"
              className="rounded-ui-rect border border-sam-border px-4 py-2 sam-text-body text-sam-muted opacity-40"
            >
              ON
            </button>
            <span className="sam-text-body text-sam-muted">
              {safeT("admin_intro_stub_preparing", {
                fallbackKo: "준비 중",
                fallbackEn: "Preparing",
              })}
            </span>
          </div>
          <p className="sam-text-helper text-sam-muted">
            {safeT("admin_intro_stub_note", {
              fallbackKo:
                "기본값 OFF. Intro runtime은 구현되지 않았으며 ON으로 활성화할 수 없습니다.",
              fallbackEn:
                "Hard default OFF. Intro runtime is not implemented and cannot be activated.",
            })}
          </p>
        </div>
      </AdminCard>
    </div>
  );
}
