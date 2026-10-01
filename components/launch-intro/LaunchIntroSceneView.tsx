"use client";

/**
 * DIBAY Intro — the ONE scene renderer (contract §1: Admin preview and runtime = SAME render
 * semantics). Admin passes a device-sized box; runtime passes the full screen. All geometry is in
 * container query units (cqmin for type, so phone portrait and tablet landscape keep the same
 * composition), so the same document lays out identically at any size.
 * Media fit: CONTAIN, centered, aspect kept. The caller resolves the image source (signed draft URL
 * in Admin, verified cache object URL at runtime). No data fetching, timers or navigation here.
 */
import type { CSSProperties } from "react";
import type { LaunchIntroScene, LaunchIntroTextSize, LaunchIntroTextStyle } from "@/lib/launch-intro/document";

export type LaunchIntroSceneViewProps = {
  scene: LaunchIntroScene;
  imageSrc: string | null;
  skipLabel: string;
  /** Document setting: false → no Skip button at all. */
  showSkip: boolean;
  /** Runtime / interactive preview only; a static preview leaves these undefined. */
  onCta?: () => void;
  onSkip?: () => void;
  /** Runtime applies the device safe-area insets; the preview box has none. */
  safeArea?: boolean;
};

/** Type scale in cqmin. L = the first slice's text size (5.6), so upgraded v1 documents look the same on phones. */
const TEXT_SIZE_CQMIN: Record<LaunchIntroTextSize, number> = { S: 4, M: 4.6, L: 5.6, XL: 7.2 };

function textStyle(t: LaunchIntroTextStyle, align: "center" | "left"): CSSProperties {
  return {
    margin: 0,
    color: t.color,
    fontSize: `${TEXT_SIZE_CQMIN[t.size]}cqmin`,
    lineHeight: 1.35,
    fontWeight: t.weight === "bold" ? 700 : 400,
    textAlign: align,
    whiteSpace: "pre-wrap",
    wordBreak: "keep-all",
    width: align === "left" ? "100%" : undefined,
  };
}

export function LaunchIntroSceneView({
  scene,
  imageSrc,
  skipLabel,
  showSkip,
  onCta,
  onSkip,
  safeArea = false,
}: LaunchIntroSceneViewProps) {
  const root: CSSProperties = {
    position: "relative",
    width: "100%",
    height: "100%",
    overflow: "hidden",
    backgroundColor: scene.background.color,
    containerType: "size",
    fontFamily: "inherit",
    userSelect: "none",
  };
  const inset = (base: string, side: "top" | "bottom") =>
    safeArea ? `calc(${base} + env(safe-area-inset-${side}, 0px))` : base;
  const text = scene.text;

  return (
    <div style={root} data-launch-intro-scene={scene.id}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: text?.align === "left" ? "stretch" : "center",
          justifyContent: "center",
          gap: "4cqh",
          padding: "0 8cqw",
        }}
      >
        {scene.media && imageSrc ? (
          // eslint-disable-next-line @next/next/no-img-element -- local verified blob / signed preview URL
          <img
            src={imageSrc}
            alt=""
            draggable={false}
            style={{
              maxWidth: "76cqw",
              maxHeight: "48cqh",
              objectFit: "contain",
              objectPosition: "center",
              display: "block",
              alignSelf: "center",
            }}
          />
        ) : null}
        {text?.headline || text?.supporting ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.6cqmin", alignItems: text.align === "left" ? "stretch" : "center" }}>
            {text.headline ? <p style={textStyle(text.headline, text.align)}>{text.headline.value}</p> : null}
            {text.supporting ? <p style={textStyle(text.supporting, text.align)}>{text.supporting.value}</p> : null}
          </div>
        ) : null}
      </div>

      {scene.cta ? (
        <button
          type="button"
          onClick={onCta}
          tabIndex={onCta ? 0 : -1}
          data-launch-intro-cta={scene.cta.action.type}
          style={{
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            bottom: inset("9cqh", "bottom"),
            minWidth: "min(52cqw, 64cqmin)",
            padding: "3.2cqmin 7cqmin",
            borderRadius: 9999,
            border: "none",
            background: "#FFFFFF",
            color: scene.background.color,
            fontSize: "4.4cqmin",
            fontWeight: 700,
            cursor: onCta ? "pointer" : "default",
          }}
        >
          {scene.cta.label}
        </button>
      ) : null}

      {showSkip ? (
        <button
          type="button"
          onClick={onSkip}
          tabIndex={onSkip ? 0 : -1}
          style={{
            position: "absolute",
            right: "4cqw",
            top: inset("3cqh", "top"),
            padding: "1.6cqmin 3.6cqmin",
            borderRadius: 9999,
            border: "none",
            background: "rgba(0,0,0,0.28)",
            color: "#FFFFFF",
            fontSize: "3.4cqmin",
            fontWeight: 600,
            cursor: onSkip ? "pointer" : "default",
          }}
        >
          {skipLabel}
        </button>
      ) : null}
    </div>
  );
}
