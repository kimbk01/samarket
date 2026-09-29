"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { IntroMediaLibrary } from "@/components/admin/intro/media/IntroMediaLibrary";

/**
 * Operator-facing Intro Media Library — Phase 4 product surface.
 * IMAGE and LOGO share this single authority.
 */
export function IntroMediaLibraryPage() {
  const { language } = useI18n();
  const ko = language === "ko";

  return (
    <div className="mx-auto max-w-6xl p-4 text-sam-fg sm:p-6" data-admin="1">
      <AdminPageHeader
        backHref="/admin/intro"
        title={ko ? "미디어 라이브러리" : "Media Library"}
        description={
          ko
            ? "인트로 이미지·로고에 쓰는 미디어를 업로드하고 확인합니다. 준비된 미디어만 선택할 수 있습니다."
            : "Upload and verify media for intro images and logos. Only Ready media can be selected."
        }
      />
      <IntroMediaLibrary ko={ko} mode="library" />
    </div>
  );
}
