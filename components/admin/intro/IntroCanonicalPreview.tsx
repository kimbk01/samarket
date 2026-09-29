"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type {
  IntroDocumentV1,
  SceneV1,
  TextPayloadV1,
  ImagePayloadV1,
  ElementV1,
  TransitionV1,
} from "@/lib/intro/contracts/document";
import { fitContentRegion, mapFrame } from "@/lib/intro/geometry/fit";

type Props = {
  document: IntroDocumentV1;
  sceneIndex?: number;
  viewportW?: number;
  viewportH?: number;
  /** mediaId → preview URL for IMAGE/LOGO */
  mediaUrls?: Record<string, string>;
  /** When true, play full multi-scene timeline with motion + transitions. */
  playTimeline?: boolean;
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
    () =>
      fitContentRegion(
        viewportW,
        viewportH,
        document.compositionAspect.w,
        document.compositionAspect.h,
      ),
    [viewportW, viewportH, document.compositionAspect.w, document.compositionAspect.h],
  );

  const bgColor =
    scene.background.type === "COLOR" ? scene.background.color : "#000000";

  const elapsed =
    sceneStartedAt == null ? Number.POSITIVE_INFINITY : Math.max(0, now - sceneStartedAt);

  return (
    <div
      data-intro13-preview-layer="1"
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

function motionStyle(
  el: ElementV1,
  region: { RW: number; RH: number },
  elapsedMs: number,
): CSSProperties {
  const type = el.motion?.type ?? "NONE";
  const start = Math.max(0, el.motion?.startMs ?? 0);
  const dur = Math.max(1, el.motion?.durationMs ?? 1);
  if (type === "NONE" || (el.motion?.durationMs ?? 0) <= 0) {
    return { opacity: el.opacity };
  }
  const t = Math.min(1, Math.max(0, (elapsedMs - start) / dur));
  const distX = region.RW * 0.25;
  const distY = region.RH * 0.25;
  switch (type) {
    case "FADE_IN":
      return { opacity: el.opacity * t };
    case "ENTER_TOP":
      return { opacity: el.opacity, transform: `translateY(${-distY * (1 - t)}px)` };
    case "ENTER_BOTTOM":
      return { opacity: el.opacity, transform: `translateY(${distY * (1 - t)}px)` };
    case "ENTER_LEFT":
      return { opacity: el.opacity, transform: `translateX(${-distX * (1 - t)}px)` };
    case "ENTER_RIGHT":
      return { opacity: el.opacity, transform: `translateX(${distX * (1 - t)}px)` };
    case "SCALE_IN":
      return {
        opacity: el.opacity,
        transform: `scale(${0.7 + 0.3 * t})`,
      };
    default:
      return { opacity: el.opacity };
  }
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
    ...motionStyle(el, region, elapsedMs),
  };

  if (el.type === "TEXT") {
    const p = el.payload as TextPayloadV1;
    const fontPx = Math.max(8, p.fontSizeNorm * region.RH);
    return (
      <div
        className="absolute flex items-center overflow-hidden"
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

/**
 * Canonical preview — same FIT + frame mapping as Android/iOS.
 * Optional full timeline: scene durations, CUT/FADE/SLIDE, element motion.
 */
export function IntroCanonicalPreview({
  document,
  sceneIndex = 0,
  viewportW = 270,
  viewportH = 480,
  mediaUrls = {},
  playTimeline = false,
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
      const dur = Math.max(1, phase.transition.durationMs);
      const t = (now - phase.startedAt) / dur;
      if (t < 1) return;
      setPhase({ kind: "scene", index: phase.to, startedAt: performance.now() });
    }
  }, [playTimeline, phase, now, document.scenes]);

  const staticScene: SceneV1 | undefined = document.scenes[sceneIndex];

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
          now={0}
        />
      </div>
    );
  }

  if (document.scenes.length === 0) {
    return (
      <div
        className="flex items-center justify-center bg-black text-sm text-white"
        style={{ width: viewportW, height: viewportH }}
      >
        장면 없음
      </div>
    );
  }

  let fromIdx = 0;
  let toIdx = 0;
  let transitionProgress = 0;
  let transition: TransitionV1 | null = null;
  let sceneStartedAt: number | null = null;

  if (phase.kind === "scene" || phase.kind === "done") {
    fromIdx = phase.index;
    toIdx = phase.index;
    sceneStartedAt = phase.kind === "scene" ? phase.startedAt : null;
  } else {
    fromIdx = phase.from;
    toIdx = phase.to;
    transition = phase.transition;
    transitionProgress = Math.min(
      1,
      Math.max(0, (now - phase.startedAt) / Math.max(1, phase.transition.durationMs)),
    );
    sceneStartedAt = phase.startedAt;
  }

  const fromScene = document.scenes[fromIdx]!;
  const toScene = document.scenes[toIdx]!;

  let outgoingStyle: CSSProperties = {};
  let incomingStyle: CSSProperties = { display: "none" };

  if (transition && fromIdx !== toIdx) {
    if (transition.type === "FADE") {
      outgoingStyle = { opacity: 1 - transitionProgress };
      incomingStyle = { opacity: transitionProgress };
    } else if (transition.type === "SLIDE") {
      const dir = transition.direction;
      const dx =
        dir === "LEFT" ? -1 : dir === "RIGHT" ? 1 : 0;
      const dy = dir === "UP" ? -1 : dir === "DOWN" ? 1 : 0;
      outgoingStyle = {
        transform: `translate(${dx * transitionProgress * 100}%, ${dy * transitionProgress * 100}%)`,
      };
      incomingStyle = {
        transform: `translate(${-dx * (1 - transitionProgress) * 100}%, ${-dy * (1 - transitionProgress) * 100}%)`,
      };
    } else {
      outgoingStyle = { display: "none" };
      incomingStyle = {};
    }
  }

  return (
    <div
      data-intro13-preview="1"
      data-intro13-timeline="1"
      className="relative overflow-hidden"
      style={{ width: viewportW, height: viewportH }}
    >
      <SceneLayer
        scene={fromScene}
        document={document}
        viewportW={viewportW}
        viewportH={viewportH}
        mediaUrls={mediaUrls}
        sceneStartedAt={transition ? null : sceneStartedAt}
        now={now}
        style={outgoingStyle}
      />
      {transition && fromIdx !== toIdx ? (
        <SceneLayer
          scene={toScene}
          document={document}
          viewportW={viewportW}
          viewportH={viewportH}
          mediaUrls={mediaUrls}
          sceneStartedAt={sceneStartedAt}
          now={now}
          style={incomingStyle}
        />
      ) : null}
    </div>
  );
}
