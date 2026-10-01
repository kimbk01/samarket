"use client";

/**
 * DIBAY Intro — the ONE scene timeline (expansion P1). Admin preview and the device overlay both
 * render the document through this component, so scene order, durations and CTA semantics are the
 * same everywhere.
 *
 * - The scene index is controlled by the caller (device overlay / Admin editor).
 * - The timeline advances only while `running` (device: after the OS release; Admin: while playing).
 *   One timer per shown scene; it is cleared whenever the scene changes or `running` goes false.
 * - CTA `next` → next scene (no exit). CTA `route` → `onRoute(path)` (device: the exit latch).
 * - Last scene elapsed → `onComplete()`.
 * No data fetching, navigation, OS release or persistence here.
 */
import { useEffect, useRef } from "react";
import { LaunchIntroSceneView } from "@/components/launch-intro/LaunchIntroSceneView";
import type { LaunchIntroDocument } from "@/lib/launch-intro/document";

export type LaunchIntroPlayerProps = {
  document: LaunchIntroDocument;
  /** sha256 → displayable URL (verified cache object URL on device, signed draft URL in Admin). */
  resolveImage: (sha256: string) => string | null;
  skipLabel: string;
  running: boolean;
  sceneIndex: number;
  onSceneIndexChange: (index: number) => void;
  onComplete?: () => void;
  onRoute?: (path: string) => void;
  onSkip?: () => void;
  /** false → CTA / Skip are drawn but inert (static preview). */
  interactive: boolean;
  safeArea?: boolean;
};

export function LaunchIntroPlayer({
  document,
  resolveImage,
  skipLabel,
  running,
  sceneIndex,
  onSceneIndexChange,
  onComplete,
  onRoute,
  onSkip,
  interactive,
  safeArea = false,
}: LaunchIntroPlayerProps) {
  const count = document.scenes.length;
  const index = Math.min(Math.max(sceneIndex, 0), count - 1);
  const scene = document.scenes[index];

  // Latest callbacks without restarting the scene timer on every parent render.
  const cb = useRef({ onSceneIndexChange, onComplete });
  useEffect(() => {
    cb.current = { onSceneIndexChange, onComplete };
  });

  useEffect(() => {
    if (!running) return;
    const id = window.setTimeout(() => {
      if (index < count - 1) cb.current.onSceneIndexChange(index + 1);
      else cb.current.onComplete?.();
    }, scene.durationMs);
    return () => window.clearTimeout(id);
  }, [running, index, count, scene.durationMs]);

  const cta = scene.cta;
  const onCta =
    interactive && cta
      ? () => {
          if (cta.action.type === "next") {
            if (index < count - 1) onSceneIndexChange(index + 1);
          } else {
            onRoute?.(cta.action.path);
          }
        }
      : undefined;

  return (
    <LaunchIntroSceneView
      key={scene.id}
      scene={scene}
      imageSrc={scene.media ? resolveImage(scene.media.asset.sha256) : null}
      skipLabel={skipLabel}
      showSkip={document.settings.skip.enabled}
      onCta={onCta}
      onSkip={interactive ? onSkip : undefined}
      safeArea={safeArea}
    />
  );
}
