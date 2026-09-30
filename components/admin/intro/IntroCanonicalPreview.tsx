"use client";

/**
 * REBUILD 14 P6 — Admin Preview UI renderer.
 *
 * Semantic authority: createPreviewSemanticApi() (P5 execution).
 * This file maps semantic output → browser DOM/CSS only.
 * No independent PreviewGeometry / PreviewMotion / PreviewTransition product rules.
 */

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type {
  IntroDocumentV1,
  SceneV1,
  TextPayloadV1,
  ImagePayloadV1,
  ElementV1,
  TransitionV1,
} from "@/lib/intro/contracts/document";
import { createPreviewSemanticApi } from "@/lib/startup-compositor";
import { PREVIEW_SOURCE } from "@/lib/startup-compositor/admin/preview";
import { mapFrame } from "@/lib/intro/geometry/fit";

type Props = {
  document: IntroDocumentV1;
  sceneIndex?: number;
  viewportW?: number;
  viewportH?: number;
  /** mediaId → preview URL for IMAGE/LOGO */
  mediaUrls?: Record<string, string>;
  /** When true, play full multi-scene timeline with motion + transitions. */
  playTimeline?: boolean;
  /** Explicit preview source label — always working document at P6. */
  previewSource?: typeof PREVIEW_SOURCE;
};

type Phase =
  | { kind: "scene"; index: number; startedAt: number }
  | {
      kind: "transition";
      from: number;
      to: number;
      startedAt: number;
      transition: TransitionV1;
    }
  | { kind: "done"; index: number };

const semanticApi = createPreviewSemanticApi();

function SceneLayer({
  scene,
  document,
  viewportW,
  viewportH,
  mediaUrls,
  sceneStartedAt,
  now,
  style,
}: {
  scene: SceneV1;
  document: IntroDocumentV1;
  viewportW: number;
  viewportH: number;
  mediaUrls: Record<string, string>;
  sceneStartedAt: number | null;
  now: number;
  style?: CSSProperties;
}) {
  const region = useMemo(
    () => semanticApi.projectCompositionRegion(viewportW, viewportH),
    [viewportW, viewportH],
  );

  const bgColor =
    scene.background.type === "COLOR" ? scene.background.color : "#000000";

  const elapsed =
    sceneStartedAt == null ? Number.POSITIVE_INFINITY : Math.max(0, now - sceneStartedAt);

  return (
    <div
      data-intro13-preview-layer="1"
      data-preview-semantic-module={semanticApi.moduleId}
      className="absolute inset-0 overflow-hidden"
      style={{ background: bgColor, ...style }}
    >
      {scene.background.type === "IMAGE" && mediaUrls[scene.background.mediaId] ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt=""
          src={mediaUrls[scene.background.mediaId]}
          className="absolute inset-0 h-full w-full"
          style={{
            objectFit: scene.background.fit === "CONTAIN" ? "contain" : "cover",
          }}
        />
      ) : null}
      <div
        className="absolute"
        style={{
          left: region.OX,
          top: region.OY,
          width: region.RW,
          height: region.RH,
          background: scene.background.type === "COLOR" ? scene.background.color : "transparent",
        }}
      >
        {[...scene.elements]
          .filter((el) => el.visible)
          .sort((a, b) => a.zIndex - b.zIndex)
          .map((el) => (
            <ElementView
              key={el.id}
              el={el}
              region={region}
              mediaUrls={mediaUrls}
              elapsedMs={elapsed}
            />
          ))}
      </div>
    </div>
  );
}

/** DOM mapping of P5 SemanticMotionState — not an independent motion engine. */
function motionStyleFromSemantic(
  el: ElementV1,
  region: { RW: number; RH: number },
  elapsedMs: number,
): CSSProperties {
  const motion = el.motion ?? { type: "NONE" as const, startMs: 0, durationMs: 0 };
  const evaluated = semanticApi.evaluateMotionAtSceneElapsed(motion, elapsedMs);
  if (!evaluated.ok) {
    return { opacity: el.opacity };
  }
  const m = evaluated.value;
  const tx = m.translateXNorm * region.RW * (el.frame.w || 1);
  const ty = m.translateYNorm * region.RH * (el.frame.h || 1);
  const transforms: string[] = [];
  if (tx !== 0 || ty !== 0) transforms.push(`translate(${tx}px, ${ty}px)`);
  if (m.scale !== 1) transforms.push(`scale(${m.scale})`);
  return {
    opacity: el.opacity * m.opacity,
    transform: transforms.length ? transforms.join(" ") : undefined,
  };
}

function ElementView({
  el,
  region,
  mediaUrls,
  elapsedMs,
}: {
  el: ElementV1;
  region: { OX: number; OY: number; RW: number; RH: number };
  mediaUrls: Record<string, string>;
  elapsedMs: number;
}) {
  const rect = mapFrame(el.frame, region);
  const box: CSSProperties = {
    left: rect.left - region.OX,
    top: rect.top - region.OY,
    width: rect.width,
    height: rect.height,
    ...motionStyleFromSemantic(el, region, elapsedMs),
  };

  if (el.type === "TEXT") {
    const p = el.payload as TextPayloadV1;
    const fontPx = Math.max(8, p.fontSizeNorm * region.RH);
    return (
      <div
        className="absolute flex items-center overflow-hidden"
        data-editor-chrome="0"
        style={{
          ...box,
          color: p.color,
          fontSize: fontPx,
          fontWeight: p.weight === "bold" ? 700 : p.weight === "medium" ? 500 : 400,
          justifyContent:
            p.align === "left" ? "flex-start" : p.align === "right" ? "flex-end" : "center",
          textAlign: p.align,
          lineHeight: 1.2,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {p.text}
      </div>
    );
  }
  if (el.type === "IMAGE" || el.type === "LOGO") {
    const p = el.payload as ImagePayloadV1;
    const url = mediaUrls[p.mediaId];
    if (!url) {
      return (
        <div
          className="absolute flex items-center justify-center bg-black/40 text-[10px] text-white"
          style={box}
        >
          미디어
        </div>
      );
    }
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        alt=""
        src={url}
        className="absolute"
        style={{
          ...box,
          objectFit: p.fit === "CONTAIN" ? "contain" : "cover",
        }}
      />
    );
  }
  if (el.type === "VIDEO") {
    // P6: VIDEO/MP4 not Admin-exposed for authoring when Preview cannot
    // drive shared-timeline playback. Keep non-authoritative muted placeholder.
    const p = el.payload as ImagePayloadV1 & { muted?: boolean; loop?: boolean };
    const url = mediaUrls[p.mediaId];
    if (!url) {
      return (
        <div
          className="absolute flex items-center justify-center bg-black/40 text-[10px] text-white"
          style={box}
        >
          영상
        </div>
      );
    }
    return (
      // eslint-disable-next-line jsx-a11y/media-has-caption
      <video
        src={url}
        className="absolute"
        style={{
          ...box,
          objectFit: p.fit === "CONTAIN" ? "contain" : "cover",
        }}
        muted
        loop={Boolean(p.loop)}
        playsInline
        // Not semantic clock authority — audio never authored as product contract.
        data-mp4-audio-decision="OPEN"
        data-mp4-preview-authority="non_authoritative"
      />
    );
  }
  if (el.type === "CTA") {
    const p = el.payload as import("@/lib/intro/contracts/document").CtaPayloadV1;
    return (
      <div
        className="absolute flex items-center justify-center text-center text-sm font-bold"
        style={{
          ...box,
          background: p.backgroundColor,
          color: p.textColor,
        }}
      >
        {p.label}
      </div>
    );
  }
  return null;
}

function transitionLayerStyle(
  transition: TransitionV1,
  elapsedMs: number,
  role: "outgoing" | "incoming",
  region: { RW: number; RH: number },
): CSSProperties {
  const evaluated = semanticApi.evaluateTransitionAtElapsed(transition, elapsedMs);
  if (!evaluated.ok) return { opacity: role === "incoming" ? 1 : 0 };
  const t = evaluated.value;
  const opacity = role === "outgoing" ? t.outgoingOpacity : t.incomingOpacity;
  const txNorm =
    role === "outgoing" ? t.outgoingTranslateXNorm : t.incomingTranslateXNorm;
  const tyNorm =
    role === "outgoing" ? t.outgoingTranslateYNorm : t.incomingTranslateYNorm;
  return {
    opacity,
    transform: `translate(${txNorm * region.RW}px, ${tyNorm * region.RH}px)`,
  };
}

/**
 * Canonical preview — P5 createPreviewSemanticApi + DOM projection.
 * Optional full timeline: scene durations, CUT/FADE/SLIDE, element motion.
 */
export function IntroCanonicalPreview({
  document,
  sceneIndex = 0,
  viewportW = 270,
  viewportH = 480,
  mediaUrls = {},
  playTimeline = false,
  previewSource = PREVIEW_SOURCE,
}: Props) {
  const [now, setNow] = useState(() => performance.now());
  const [phase, setPhase] = useState<Phase>(() => ({
    kind: "scene",
    index: 0,
    startedAt: performance.now(),
  }));
  const playGen = useRef(0);

  useEffect(() => {
    if (!playTimeline) return;
    playGen.current += 1;
    const gen = playGen.current;
    const start = performance.now();
    setPhase({ kind: "scene", index: 0, startedAt: start });
    setNow(start);
    let raf = 0;
    const tick = () => {
      if (gen !== playGen.current) return;
      setNow(performance.now());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playTimeline, document]);

  useEffect(() => {
    if (!playTimeline) return;
    if (phase.kind === "done") return;

    if (phase.kind === "scene") {
      const scene = document.scenes[phase.index];
      if (!scene) {
        setPhase({ kind: "done", index: Math.max(0, phase.index - 1) });
        return;
      }
      const remain = Math.max(0, scene.durationMs - (now - phase.startedAt));
      if (remain > 16) return;
      const next = phase.index + 1;
      if (next >= document.scenes.length) {
        setPhase({ kind: "done", index: phase.index });
        return;
      }
      const transition = scene.transition;
      if (transition.type === "CUT" || transition.durationMs <= 0) {
        setPhase({ kind: "scene", index: next, startedAt: performance.now() });
        return;
      }
      setPhase({
        kind: "transition",
        from: phase.index,
        to: next,
        startedAt: performance.now(),
        transition,
      });
      return;
    }

    if (phase.kind === "transition") {
      const evaluated = semanticApi.evaluateTransitionAtElapsed(
        phase.transition,
        now - phase.startedAt,
      );
      if (!evaluated.ok || !evaluated.value.complete) return;
      setPhase({ kind: "scene", index: phase.to, startedAt: performance.now() });
    }
  }, [playTimeline, phase, now, document.scenes]);

  const staticScene: SceneV1 | undefined = document.scenes[sceneIndex];
  const region = semanticApi.projectCompositionRegion(viewportW, viewportH);

  if (!playTimeline) {
    if (!staticScene) {
      return (
        <div
          className="flex items-center justify-center bg-black text-sm text-white"
          style={{ width: viewportW, height: viewportH }}
        >
          장면 없음
        </div>
      );
    }
    return (
      <div
        data-intro13-preview="1"
        data-preview-source={previewSource}
        data-preview-semantic-module={semanticApi.moduleId}
        data-preview-mutates-live="0"
        className="relative overflow-hidden"
        style={{ width: viewportW, height: viewportH }}
      >
        <SceneLayer
          scene={staticScene}
          document={document}
          viewportW={viewportW}
          viewportH={viewportH}
          mediaUrls={mediaUrls}
          sceneStartedAt={null}
          now={now}
        />
      </div>
    );
  }

  const sceneA =
    phase.kind === "scene" || phase.kind === "done"
      ? document.scenes[phase.index]
      : document.scenes[phase.from];
  const sceneB =
    phase.kind === "transition" ? document.scenes[phase.to] : undefined;

  return (
    <div
      data-intro13-preview="1"
      data-preview-source={previewSource}
      data-preview-semantic-module={semanticApi.moduleId}
      data-preview-mutates-live="0"
      data-transition-duration-mode={semanticApi.TRANSITION_DURATION_MODE}
      className="relative overflow-hidden"
      style={{ width: viewportW, height: viewportH }}
    >
      {sceneA ? (
        <SceneLayer
          scene={sceneA}
          document={document}
          viewportW={viewportW}
          viewportH={viewportH}
          mediaUrls={mediaUrls}
          sceneStartedAt={phase.kind === "scene" ? phase.startedAt : null}
          now={now}
          style={
            phase.kind === "transition"
              ? transitionLayerStyle(
                  phase.transition,
                  now - phase.startedAt,
                  "outgoing",
                  region,
                )
              : undefined
          }
        />
      ) : null}
      {phase.kind === "transition" && sceneB ? (
        <SceneLayer
          scene={sceneB}
          document={document}
          viewportW={viewportW}
          viewportH={viewportH}
          mediaUrls={mediaUrls}
          sceneStartedAt={null}
          now={now}
          style={transitionLayerStyle(
            phase.transition,
            now - phase.startedAt,
            "incoming",
            region,
          )}
        />
      ) : null}
    </div>
  );
}
