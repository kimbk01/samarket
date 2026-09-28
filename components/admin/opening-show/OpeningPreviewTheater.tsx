"use client";

import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { OpeningSceneSurface } from "@/components/admin/opening-show/OpeningSceneSurface";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { OpeningDocument } from "@/lib/opening-show/document";
import type { OpeningReadyMedia } from "@/lib/opening-show/types";

export function OpeningPreviewTheater({
  document,
  mediaById,
  onExit,
}: {
  document: OpeningDocument;
  mediaById: Map<string, OpeningReadyMedia>;
  onExit: () => void;
}) {
  const { safeT } = useI18n();
  return (
    <div className="fixed inset-0 z-[200] bg-black" data-opening-preview="1">
      <OpeningSceneSurface document={document} mediaById={mediaById} mode="preview" />
      <div className="absolute right-4 top-4 z-[201]">
        <AdminActionButton variant="primary" onClick={onExit}>
          {safeT("admin_opening_preview_back", {
            fallbackKo: "편집으로 돌아가기",
            fallbackEn: "Back to editing",
          })}
        </AdminActionButton>
      </div>
    </div>
  );
}
