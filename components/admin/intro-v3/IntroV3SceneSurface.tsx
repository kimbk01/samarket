"use client";

import type { IntroV3Background } from "@/lib/startup/intro-v3/document";

export function IntroV3SceneSurface({ background }: { background: IntroV3Background }) {
  const color = background.type === "COLOR" ? background.color : "#0B5F3A";
  const gradient =
    background.type === "GRADIENT"
      ? `linear-gradient(${background.angleDeg}deg, ${background.colorA}, ${background.colorB})`
      : null;

  return (
    <div className="flex justify-center">
      <div
        data-intro-v3-scene-surface="1"
        className="relative overflow-hidden rounded-ui-rect border border-sam-border"
        style={{
          width: "min(100%, 360px)",
          aspectRatio: "9 / 16",
          background: gradient ?? color,
        }}
      />
    </div>
  );
}
