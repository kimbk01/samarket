"use client";

/**
 * DIBAY Intro — the ONE scene renderer (contract §1: Admin preview and runtime = SAME render
 * semantics). Admin passes a phone-sized box; runtime passes the full screen. All geometry is in
 * container query units, so the same document lays out identically at any size.
 * Image fit: CONTAIN (slice). The caller resolves the image source (signed draft URL in Admin,
 * verified cache object URL at runtime). No data fetching, timers or navigation here.
 */
import type { CSSProperties } from "react";
import type { LaunchIntroScene } from "@/lib/launch-intro/document";

export type LaunchIntroSceneViewProps = {
  scene: LaunchIntroScene;
  imageSrc: string | null;
  skipLabel: string;
  /** Runtime only; Admin preview leaves these undefined (non-interactive). */
  onCta?: () => void;
  onSkip?: () => void;
  /** Runtime applies the device safe-area insets; the preview box has none. */
  safeArea?: boolean;
};

export function LaunchIntroSceneView({
  scene,
  imageSrc,
  skipLabel,
  onCta,
  onSkip,
  safeArea = false,
}: LaunchIntroSceneViewProps) {
  const root: CSSProperties = {
    position: "relative",
    width: "100%",
    height: "100%",
    overflow: "hidden",
    backgroundColor: scene.background,
    containerType: "size",
    fontFamily: "inherit",
    userSelect: "none",
  };
  const inset = (base: string, side: "top" | "bottom") =>
    safeArea ? `calc(${base} + env(safe-area-inset-${side}, 0px))` : base;

  return (
    <div style={root} data-launch-intro-scene={scene.id}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "4cqh",
          padding: "0 8cqw",
        }}
      >
        {imageSrc ? (
          // eslint-disable-next-line @next/next/no-img-element -- local verified blob / signed preview URL
          <img
            src={imageSrc}
            alt=""
            draggable={false}
            style={{ maxWidth: "76cqw", maxHeight: "48cqh", objectFit: "contain", display: "block" }}
          />
        ) : null}
        {scene.text ? (
          <p
            style={{
              margin: 0,
              color: scene.text.color,
              fontSize: "5.6cqw",
              lineHeight: 1.35,
              fontWeight: 700,
              textAlign: "center",
              whiteSpace: "pre-wrap",
              wordBreak: "keep-all",
            }}
          >
            {scene.text.value}
          </p>
        ) : null}
      </div>

      {scene.cta ? (
        <button
          type="button"
          onClick={onCta}
          tabIndex={onCta ? 0 : -1}
          style={{
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            bottom: inset("9cqh", "bottom"),
            minWidth: "52cqw",
            padding: "3.2cqw 7cqw",
            borderRadius: 9999,
            border: "none",
            background: "#FFFFFF",
            color: scene.background,
            fontSize: "4.4cqw",
            fontWeight: 700,
            cursor: onCta ? "pointer" : "default",
          }}
        >
          {scene.cta.label}
        </button>
      ) : null}

      <button
        type="button"
        onClick={onSkip}
        tabIndex={onSkip ? 0 : -1}
        style={{
          position: "absolute",
          right: "4cqw",
          top: inset("3cqh", "top"),
          padding: "1.6cqw 3.6cqw",
          borderRadius: 9999,
          border: "none",
          background: "rgba(0,0,0,0.28)",
          color: "#FFFFFF",
          fontSize: "3.4cqw",
          fontWeight: 600,
          cursor: onSkip ? "pointer" : "default",
        }}
      >
        {skipLabel}
      </button>
    </div>
  );
}
