"use client";

import { introSceneBackgroundCssColor } from "@/lib/startup/intro/renderer/scene-background";
import type { IntroV3Background } from "@/lib/startup/intro-v3/document";

export function SceneWorkspace({ background }: { background: IntroV3Background | null }) {
  const color = introSceneBackgroundCssColor(background);
  return (
    <section
      className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#ececf1] p-6"
      data-intro-workspace="1"
    >
      <div
        className="min-h-0 min-w-0 flex-1 overflow-hidden rounded-ui-rect shadow-[0_8px_24px_rgba(15,23,42,0.12)] ring-1 ring-black/10"
        data-intro-scene-surface="1"
        data-intro-scene-aspect="viewport"
        style={{ backgroundColor: color }}
      />
    </section>
  );
}
