"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";

export function SceneStoryboard({
  sceneId,
  sceneLabel,
}: {
  sceneId: string;
  sceneLabel: string;
}) {
  const { safeT } = useI18n();
  return (
    <aside
      className="flex min-h-0 w-52 shrink-0 flex-col border-r border-sam-border bg-sam-surface"
      data-intro-storyboard="1"
    >
      <p className="px-3 py-2 text-[12px] font-semibold uppercase tracking-wide text-sam-muted">
        {safeT("admin_intro_scenes", { fallbackKo: "장면", fallbackEn: "Scenes" })}
      </p>
      <button
        type="button"
        className="mx-2 rounded-ui-rect bg-sam-app px-3 py-2 text-left text-[13px] font-semibold text-sam-fg"
        data-intro-storyboard-scene={sceneId}
      >
        {sceneLabel}
      </button>
    </aside>
  );
}
