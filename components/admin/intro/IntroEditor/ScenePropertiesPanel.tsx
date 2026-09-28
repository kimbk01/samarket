"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";

export function ScenePropertiesPanel({
  color,
  onColorChange,
}: {
  color: string;
  onColorChange: (color: string) => void;
}) {
  const { safeT } = useI18n();
  return (
    <aside
      className="flex min-h-0 w-64 shrink-0 flex-col overflow-y-auto border-l border-sam-border bg-sam-surface p-4"
      data-intro-properties="1"
      data-intro-scene-properties="1"
    >
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
    </aside>
  );
}
