"use client";

import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { IntroV3Layer } from "@/lib/startup/intro-v3/document";
import type { IntroV3Fit } from "@/lib/startup/intro-v3/geometry";
import type { IntroV3ReadyCatalogItem } from "@/lib/startup/intro-v3/media-upload-client";
import { introV3CatalogDimensionsLabel, introV3CatalogToken } from "@/lib/startup/intro-v3/media-upload-client";

export function ScenePropertiesPanel({
  color,
  selected,
  catalog,
  onColorChange,
  onFitChange,
  onVisibleChange,
  onZChange,
  onReplace,
  onDelete,
}: {
  color: string;
  selected: IntroV3Layer | null;
  catalog: IntroV3ReadyCatalogItem[];
  onColorChange: (color: string) => void;
  onFitChange: (fit: IntroV3Fit) => void;
  onVisibleChange: (visible: boolean) => void;
  onZChange: (direction: "forward" | "back") => void;
  onReplace: () => void;
  onDelete: () => void;
}) {
  const { safeT } = useI18n();
  const image = selected?.type === "IMAGE" ? selected : null;
  const item = image
    ? catalog.find((entry) => introV3CatalogToken(entry) === image.payload.mediaRef) ?? null
    : null;
  const filename = item?.source.filename || image?.payload.alt || "";
  const dims = item ? introV3CatalogDimensionsLabel(item) : "";

  return (
    <aside
      className="flex min-h-0 w-72 shrink-0 flex-col overflow-y-auto border-l border-sam-border bg-sam-surface p-4"
      data-intro-properties="1"
      data-intro-inspector="1"
      data-intro-scene-properties="1"
    >
      {image ? (
        <div data-intro-image-inspector="1">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-sam-muted">
            {safeT("admin_intro_add_image", { fallbackKo: "이미지", fallbackEn: "Image" })}
          </p>
          {filename ? <p className="mt-2 truncate text-[13px] font-medium text-sam-fg">{filename}</p> : null}
          {dims ? <p className="text-[12px] text-sam-muted">{dims}</p> : null}
          <p className="mt-4 text-[13px] font-medium text-sam-fg">
            {safeT("admin_intro_fit", { fallbackKo: "맞춤", fallbackEn: "Fit" })}
          </p>
          <div className="mt-2 flex gap-2">
            <AdminActionButton
              variant={image.geometry.fit === "CONTAIN" ? "primary" : "secondary"}
              onClick={() => onFitChange("CONTAIN")}
              data-intro-fit-contain="1"
            >
              {safeT("admin_intro_fit_contain", { fallbackKo: "안에 맞춤", fallbackEn: "Contain" })}
            </AdminActionButton>
            <AdminActionButton
              variant={image.geometry.fit === "COVER" ? "primary" : "secondary"}
              onClick={() => onFitChange("COVER")}
              data-intro-fit-cover="1"
            >
              {safeT("admin_intro_fit_cover", { fallbackKo: "채우기", fallbackEn: "Cover" })}
            </AdminActionButton>
          </div>
          <label className="mt-4 flex items-center gap-2 text-[13px] text-sam-fg">
            <input
              type="checkbox"
              checked={image.visible}
              onChange={(event) => onVisibleChange(event.target.checked)}
              data-intro-visible="1"
            />
            {safeT("admin_intro_visible", { fallbackKo: "표시", fallbackEn: "Visible" })}
          </label>
          <div className="mt-3 flex gap-2">
            <AdminActionButton variant="secondary" onClick={() => onZChange("back")} data-intro-z-back="1">
              {safeT("admin_intro_layer_back", { fallbackKo: "뒤로", fallbackEn: "Back" })}
            </AdminActionButton>
            <AdminActionButton variant="secondary" onClick={() => onZChange("forward")} data-intro-z-forward="1">
              {safeT("admin_intro_layer_forward", { fallbackKo: "앞으로", fallbackEn: "Forward" })}
            </AdminActionButton>
          </div>
          <div className="mt-4 flex flex-col gap-2">
            <AdminActionButton variant="secondary" onClick={onReplace} data-intro-replace="1">
              {safeT("admin_intro_v3_replace_image", { fallbackKo: "이미지 바꾸기", fallbackEn: "Replace image" })}
            </AdminActionButton>
            <AdminActionButton variant="danger" onClick={onDelete} data-intro-delete-layer="1">
              {safeT("admin_intro_delete_layer", { fallbackKo: "레이어 삭제", fallbackEn: "Delete layer" })}
            </AdminActionButton>
          </div>
        </div>
      ) : (
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-wide text-sam-muted">
            {safeT("admin_intro_inspector_scene", { fallbackKo: "장면", fallbackEn: "Scene" })}
          </p>
          <label className="mt-3 block text-[13px] font-medium text-sam-fg">
            {safeT("admin_intro_bg_color", { fallbackKo: "배경색", fallbackEn: "Background color" })}
          </label>
          <div className="mt-2 flex items-center gap-2">
            <input
              type="color"
              value={/^#[0-9A-Fa-f]{6}$/.test(color) ? color : "#111111"}
              onChange={(event) => onColorChange(event.target.value.toUpperCase())}
              className="h-9 w-12 cursor-pointer rounded-ui-rect border border-sam-border bg-sam-app"
              data-intro-bg-color="1"
              aria-label={safeT("admin_intro_bg_color", { fallbackKo: "배경색", fallbackEn: "Background color" })}
            />
            <input
              value={color}
              onChange={(event) => {
                const next = event.target.value.trim().toUpperCase();
                if (/^#[0-9A-F]{6}$/.test(next)) onColorChange(next);
              }}
              className="min-h-9 flex-1 rounded-ui-rect border border-sam-border bg-sam-app px-2 text-[13px] text-sam-fg"
              data-intro-bg-color-hex="1"
            />
          </div>
        </div>
      )}
    </aside>
  );
}
