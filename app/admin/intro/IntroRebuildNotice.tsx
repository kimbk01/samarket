"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminActionLink } from "@/components/admin/ui/AdminActionButton";

/**
 * Intro Admin hub — Phase 4 Media entry is product-facing.
 * Studio / publish / live-pointer controls remain intentionally absent (rebuild).
 */
export function IntroRebuildNotice() {
  const { language } = useI18n();
  const ko = language === "ko";

  return (
    <div className="mx-auto max-w-xl p-6 text-sam-fg" data-admin="1">
      <h1 className="text-lg font-semibold">인트로</h1>
      <p className="mt-3 text-sm text-sam-muted">인트로 시스템 재구성 중</p>
      <p className="mt-2 text-sm text-sam-muted">
        Intro is disabled for a clean rebuild. The app goes from the OS launch
        surface to HOME.
      </p>

      <section
        className="mt-6 space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4"
        data-intro-media-entry="1"
      >
        <h2 className="text-sm font-semibold text-sam-fg">
          {ko ? "미디어" : "Media"}
        </h2>
        <p className="text-sm text-sam-muted">
          {ko
            ? "인트로에 쓸 이미지·로고·GIF를 PC에서 올리고 확인할 수 있습니다."
            : "Upload and verify images, logos, and GIFs for intro from your PC."}
        </p>
        <div className="flex flex-wrap gap-2">
          <AdminActionLink href="/admin/intro/media" variant="primary">
            {ko ? "미디어 라이브러리" : "Media Library"}
          </AdminActionLink>
          <AdminActionLink
            href="/admin/intro/media/picker"
            variant="secondary"
          >
            {ko ? "선택 흐름 확인" : "Picker harness"}
          </AdminActionLink>
        </div>
      </section>

      <p className="mt-6 text-xs text-sam-muted">
        {ko
          ? "장면 편집 · 게시 · 라이브 설정은 아직 제공되지 않습니다."
          : "Scene editing, document release, and live activation are not available yet."}
      </p>
      {/* verified-zero: no product controls for release/live activation */}
      <Link href="/admin" className="mt-4 inline-block text-xs text-sam-muted underline">
        {ko ? "관리자 홈" : "Admin home"}
      </Link>
    </div>
  );
}
