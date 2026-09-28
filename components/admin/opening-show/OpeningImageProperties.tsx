"use client";

import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { OpeningImageFit, OpeningImageLayer } from "@/lib/opening-show/document";

export function OpeningImageProperties({
  layer,
  fileName,
  onFit,
  onVisible,
  onForward,
  onBackward,
  onReplace,
  onDelete,
}: {
  layer: OpeningImageLayer;
  fileName: string;
  onFit: (fit: OpeningImageFit) => void;
  onVisible: (visible: boolean) => void;
  onForward: () => void;
  onBackward: () => void;
  onReplace: () => void;
  onDelete: () => void;
}) {
  const { safeT } = useI18n();

  return (
    <div className="flex flex-col gap-4" data-opening-properties="1">
      <p className="truncate text-sm font-medium text-sam-fg">{fileName}</p>
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-sam-muted">
          {safeT("admin_opening_fit", { fallbackKo: "맞춤", fallbackEn: "Fit" })}
        </p>
        <div className="flex gap-2">
          <AdminActionButton
            variant={layer.fit === "contain" ? "primary" : "secondary"}
            onClick={() => onFit("contain")}
          >
            {safeT("admin_opening_fit_contain", { fallbackKo: "contain", fallbackEn: "contain" })}
          </AdminActionButton>
          <AdminActionButton
            variant={layer.fit === "cover" ? "primary" : "secondary"}
            onClick={() => onFit("cover")}
          >
            {safeT("admin_opening_fit_cover", { fallbackKo: "cover", fallbackEn: "cover" })}
          </AdminActionButton>
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-sam-fg">
        <input
          type="checkbox"
          checked={layer.visible}
          onChange={(event) => onVisible(event.target.checked)}
        />
        {safeT("admin_opening_visible", { fallbackKo: "표시", fallbackEn: "Visible" })}
      </label>
      <div className="flex flex-wrap gap-2">
        <AdminActionButton variant="secondary" onClick={onForward}>
          {safeT("admin_opening_forward", { fallbackKo: "앞으로", fallbackEn: "Forward" })}
        </AdminActionButton>
        <AdminActionButton variant="secondary" onClick={onBackward}>
          {safeT("admin_opening_backward", { fallbackKo: "뒤로", fallbackEn: "Backward" })}
        </AdminActionButton>
      </div>
      <div className="flex flex-wrap gap-2">
        <AdminActionButton variant="secondary" onClick={onReplace}>
          {safeT("admin_opening_replace", { fallbackKo: "교체", fallbackEn: "Replace" })}
        </AdminActionButton>
        <AdminActionButton variant="danger" onClick={onDelete}>
          {safeT("admin_opening_delete", { fallbackKo: "삭제", fallbackEn: "Delete" })}
        </AdminActionButton>
      </div>
    </div>
  );
}
