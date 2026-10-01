"use client";

/**
 * DIBAY Intro — the ONE scene renderer (contract §1: Admin preview and runtime = SAME render
 * semantics). Admin passes a device-sized box; runtime passes the full screen. All geometry is in
 * container query units (cqmin for type, so phone portrait and tablet landscape keep the same
 * composition), so the same document lays out identically at any size.
 *
 * Compositions are fixed presets (stack · fullbleed · logo); Admin only picks one. Images keep their
 * aspect ratio: contain (default, never cut) or cover (explicit crop that fills its box).
 * Motion comes only from the preset classes in LaunchIntroMotionStyles. The caller resolves image
 * sources (signed draft URLs in Admin, verified cache object URLs at runtime).
 * No data fetching, timers or navigation here.
 */
import { useState, type CSSProperties, type ReactNode } from "react";
import type {
  LaunchIntroDecorationSlot,
  LaunchIntroFit,
  LaunchIntroFittedMedia,
  LaunchIntroImageRef,
  LaunchIntroScene,
  LaunchIntroTextSize,
  LaunchIntroTextStyle,
} from "@/lib/launch-intro/document";

export type LaunchIntroSceneViewProps = {
  scene: LaunchIntroScene;
  resolveImage: (sha256: string) => string | null;
  skipLabel: string;
  /** Document setting: false → no Skip button at all. */
  showSkip: boolean;
  /**
   * false for the first scene: it is the Intro's first meaningful frame right after the OS screen,
   * so its parts are visible at once (float still applies).
   */
  animateEnter: boolean;
  /**
   * Videos play only while true (device: after the OS release; Admin: while playing). Until then,
   * and if playback fails, the poster image is what is shown — same pixels, same box.
   */
  playVideo: boolean;
  /** Runtime / interactive preview only; a static preview leaves these undefined. */
  onCta?: () => void;
  onSkip?: () => void;
  /** Runtime applies the device safe-area insets; the preview box has none. */
  safeArea?: boolean;
};

/** Type scale in cqmin. L = the first slice's text size (5.6), so upgraded v1 documents look the same on phones. */
const TEXT_SIZE_CQMIN: Record<LaunchIntroTextSize, number> = { S: 4, M: 4.6, L: 5.6, XL: 7.2 };
const DECORATION_SIZE_CQMIN = { S: 16, M: 26 } as const;
/** Enter stagger (ms) per part, so a scene builds up instead of appearing as one block. */
const STAGGER = { visual: 0, text: 120, cta: 240 } as const;

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

function slotStyle(slot: LaunchIntroDecorationSlot, safeArea: boolean): CSSProperties {
  const [v, h] = slot.split("-") as ["top" | "bottom", "left" | "right"];
  const edge = v === "top" ? "10cqh" : "20cqh";
  return {
    position: "absolute",
    [v]: safeArea ? `calc(${edge} + env(safe-area-inset-${v}, 0px))` : edge,
    [h]: "5cqw",
  };
}

function Img({
  src,
  fit,
  style,
}: {
  src: string;
  fit: LaunchIntroFit;
  style: CSSProperties;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- local verified blob / signed preview URL
    <img src={src} alt="" draggable={false} style={{ display: "block", objectFit: fit, objectPosition: "center", ...style }} />
  );
}

/**
 * Image, GIF, or MP4 with its poster, in one box. Video: muted + playsInline + autoplay + loop, no
 * controls, never needs audio permission or a gesture. On error the poster stays (no timer, no retry).
 */
function FittedMedia({
  media,
  resolveImage,
  playVideo,
  style,
}: {
  media: LaunchIntroFittedMedia;
  resolveImage: (sha256: string) => string | null;
  playVideo: boolean;
  style: CSSProperties;
}) {
  const [failed, setFailed] = useState(false);
  const poster = resolveImage(media.asset.sha256);
  const videoSrc = media.video ? resolveImage(media.video.sha256) : null;
  if (media.video && videoSrc && playVideo && !failed) {
    return (
      <video
        src={videoSrc}
        poster={poster ?? undefined}
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        disablePictureInPicture
        controls={false}
        data-launch-intro-video={media.video.sha256.slice(0, 8)}
        ref={(el) => {
          // React does not reflect `muted` as an attribute; iOS autoplay requires the muted state.
          if (el) {
            el.muted = true;
            el.defaultMuted = true;
          }
        }}
        onError={() => setFailed(true)}
        style={{ display: "block", objectFit: media.fit, objectPosition: "center", ...style }}
      />
    );
  }
  return poster ? <Img src={poster} fit={media.fit} style={style} /> : null;
}

export function LaunchIntroSceneView({
  scene,
  resolveImage,
  skipLabel,
  showSkip,
  animateEnter,
  playVideo,
  onCta,
  onSkip,
  safeArea = false,
}: LaunchIntroSceneViewProps) {
  const inset = (base: string, side: "top" | "bottom") =>
    safeArea ? `calc(${base} + env(safe-area-inset-${side}, 0px))` : base;
  const src = (ref: LaunchIntroImageRef | undefined) => (ref ? resolveImage(ref.sha256) : null);
  const enter = animateEnter && scene.motion.enter !== "none" ? `lim-enter-${scene.motion.enter}` : undefined;
  const part = (delay: number, children: ReactNode, style?: CSSProperties) => (
    <div className={enter} style={{ animationDelay: `${delay}ms`, ...style }}>
      {children}
    </div>
  );
  const floating = (children: ReactNode) =>
    scene.motion.float ? <div className="lim-float">{children}</div> : children;

  const text = scene.text;
  const align = text?.align ?? "center";
  const textBlock =
    text?.headline || text?.supporting ? (
      <div style={{ display: "flex", flexDirection: "column", gap: "1.6cqmin", alignItems: align === "left" ? "stretch" : "center", width: "100%" }}>
        {text.headline ? <p style={textStyle(text.headline, align)}>{text.headline.value}</p> : null}
        {text.supporting ? <p style={textStyle(text.supporting, align)}>{text.supporting.value}</p> : null}
      </div>
    ) : null;

  const mediaSrc = src(scene.media?.asset);
  const logoSrc = src(scene.logo?.asset);
  const bgSrc = src(scene.background.media?.asset);

  // Visual box per composition. contain: natural size within the box; cover: fills the box (crop).
  const stackMedia =
    scene.media && mediaSrc
      ? floating(
          <FittedMedia
            media={scene.media}
            resolveImage={resolveImage}
            playVideo={playVideo}
            style={
              scene.media.fit === "cover"
                ? { width: "76cqw", height: "48cqh" }
                : { maxWidth: "76cqw", maxHeight: "48cqh" }
            }
          />
        )
      : null;
  const smallLogo = logoSrc ? <Img src={logoSrc} fit="contain" style={{ maxWidth: "36cqmin", maxHeight: "12cqh" }} /> : null;

  let content: ReactNode;
  if (scene.layout === "fullbleed") {
    content = (
      <>
        {scene.media && mediaSrc
          ? part(STAGGER.visual, floating(<FittedMedia media={scene.media} resolveImage={resolveImage} playVideo={playVideo} style={{ width: "100cqw", height: "100cqh" }} />), {
              position: "absolute",
              inset: 0,
            })
          : null}
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: "55cqh", background: "linear-gradient(to bottom, rgba(0,0,0,0), rgba(0,0,0,0.45))" }} />
        {smallLogo ? part(STAGGER.visual, smallLogo, { position: "absolute", top: inset("8cqh", "top"), left: 0, right: 0, display: "flex", justifyContent: "center" }) : null}
        {textBlock
          ? part(STAGGER.text, textBlock, {
              position: "absolute",
              left: "8cqw",
              right: "8cqw",
              bottom: inset(scene.cta ? "22cqh" : "12cqh", "bottom"),
              display: "flex",
              justifyContent: "center",
            })
          : null}
      </>
    );
  } else {
    const visual =
      scene.layout === "logo"
        ? logoSrc
          ? floating(<Img src={logoSrc} fit="contain" style={{ maxWidth: "56cqmin", maxHeight: "28cqh" }} />)
          : null
        : stackMedia;
    content = (
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: align === "left" ? "stretch" : "center",
          justifyContent: "center",
          gap: "4cqh",
          padding: "0 8cqw",
        }}
      >
        {scene.layout === "stack" && smallLogo ? part(STAGGER.visual, smallLogo, { alignSelf: "center" }) : null}
        {visual ? part(STAGGER.visual, visual, { alignSelf: "center" }) : null}
        {textBlock ? part(STAGGER.text, textBlock, { width: "100%", display: "flex", justifyContent: "center" }) : null}
      </div>
    );
  }

  return (
    <div
      data-launch-intro-scene={scene.id}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        backgroundColor: scene.background.color,
        containerType: "size",
        fontFamily: "inherit",
        userSelect: "none",
      }}
    >
      {scene.background.media && bgSrc ? (
        <FittedMedia
          media={scene.background.media}
          resolveImage={resolveImage}
          playVideo={playVideo}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        />
      ) : null}

      {scene.decorations.map((d) => {
        const dsrc = src(d.asset);
        if (!dsrc) return null;
        const size = `${DECORATION_SIZE_CQMIN[d.size]}cqmin`;
        return (
          <div key={d.slot} className={enter} style={{ ...slotStyle(d.slot, safeArea), animationDelay: `${STAGGER.text}ms` }}>
            {floating(<Img src={dsrc} fit="contain" style={{ maxWidth: size, maxHeight: size }} />)}
          </div>
        );
      })}

      {content}

      {scene.cta ? (
        <div
          className={enter}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: inset("9cqh", "bottom"),
            display: "flex",
            justifyContent: "center",
            animationDelay: `${STAGGER.cta}ms`,
          }}
        >
          <button
            type="button"
            onClick={onCta}
            tabIndex={onCta ? 0 : -1}
            data-launch-intro-cta={scene.cta.action.type}
            style={{
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
        </div>
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
