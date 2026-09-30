"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { StartupPresentationRuntime } from "@/components/startup-presentation/StartupPresentationRuntime";
import {
  createBootstrapGenerationManifestR15,
  evaluateStartupPresentationEngineR15,
  projectStartupPresentationPaintR15,
  type StartupPresentationEngineStateR15,
} from "@/lib/startup-presentation/engine";
import type { GenerationManifestR15 } from "@/lib/startup-presentation/document";
import {
  discoverAndPromoteLatestStartupGenerationR15,
  loadActiveStartupGenerationR15,
  loadStartupAssetBlobUrlR15,
} from "@/lib/startup-presentation/client-store";
import {
  isInitialDestinationVisualReady,
  markInitialDestinationVisualReady,
  subscribeInitialDestinationVisualReady,
  tryDismissNativeSplash,
} from "@/lib/startup/startup-metrics";

function nowMs(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function isProductStartupPresentationPath(pathname: string | null): boolean {
  const path = pathname?.split("?")[0] || "/";
  if (
    path.startsWith("/admin") ||
    path.startsWith("/login") ||
    path.startsWith("/signup") ||
    path.startsWith("/account") ||
    path.startsWith("/auth") ||
    path.startsWith("/api")
  ) {
    return false;
  }
  return true;
}

export function StartupPresentationOwner() {
  const pathname = usePathname();
  const [manifest, setManifest] = useState<GenerationManifestR15 | null>(null);
  const [assetSrc, setAssetSrc] = useState<string | null>(null);
  const [visibleCommittedAt, setVisibleCommittedAt] = useState<number | null>(null);
  const [homeReady, setHomeReady] = useState(false);
  const [state, setState] = useState<StartupPresentationEngineStateR15>("BOOTSTRAP");
  const [hidden, setHidden] = useState(false);
  const stateEnteredAtRef = useRef(nowMs());
  const visualCommitNotifiedRef = useRef(false);
  const shouldPresent = isProductStartupPresentationPath(pathname);

  useEffect(() => {
    if (!shouldPresent) return;
    let cancelled = false;
    void (async () => {
      const active = await loadActiveStartupGenerationR15();
      if (!cancelled) setManifest(active ?? createBootstrapGenerationManifestR15());
      void discoverAndPromoteLatestStartupGenerationR15();
    })();
    return () => {
      cancelled = true;
    };
  }, [shouldPresent]);

  useEffect(() => {
    if (isInitialDestinationVisualReady()) setHomeReady(true);
    return subscribeInitialDestinationVisualReady(() => setHomeReady(true));
  }, []);

  useEffect(() => {
    if (!shouldPresent) return;
    const path = pathname?.split("?")[0] || "/";
    const isMainShellPath =
      path === "/" ||
      path.startsWith("/philife") ||
      path.startsWith("/market") ||
      path.startsWith("/stores") ||
      path.startsWith("/community-messenger") ||
      path.startsWith("/my") ||
      path.startsWith("/search") ||
      path.startsWith("/services") ||
      path.startsWith("/post") ||
      path.startsWith("/write") ||
      path.startsWith("/orders");
    if (isMainShellPath || isInitialDestinationVisualReady()) return;
    let cancelled = false;
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!cancelled) markInitialDestinationVisualReady();
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [pathname, shouldPresent]);

  const paint = useMemo(() => projectStartupPresentationPaintR15(manifest), [manifest]);

  useEffect(() => {
    let revoked: string | null = null;
    let cancelled = false;
    void (async () => {
      const src = await loadStartupAssetBlobUrlR15(
        paint.generationId,
        paint.logo.asset?.assetId ?? null
      );
      if (cancelled) {
        if (src) URL.revokeObjectURL(src);
        return;
      }
      revoked = src;
      setAssetSrc(src);
    })();
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [paint.generationId, paint.logo.asset?.assetId]);

  const markVisualCommit = useCallback(() => {
    if (visualCommitNotifiedRef.current) return;
    visualCommitNotifiedRef.current = true;
    const t = nowMs();
    setVisibleCommittedAt(t);
    tryDismissNativeSplash("startup_presentation_visible");
    if (typeof console !== "undefined") {
      console.info("[dibay-r15-startup] SYSTEM_START_VISIBLE", {
        generationId: paint.generationId,
      });
    }
  }, [paint.generationId]);

  useEffect(() => {
    if (hidden || !manifest) return;
    const tick = () => {
      const output = evaluateStartupPresentationEngineR15({
        manifest,
        homePresentationReady: homeReady,
        visibleCommittedAt,
        state,
        stateEnteredAt: stateEnteredAtRef.current,
        clock: { now: nowMs },
      });
      if (output.state !== state) {
        stateEnteredAtRef.current = nowMs();
        setState(output.state);
      }
      if (output.shouldHandoff) {
        setHidden(true);
      }
    };
    tick();
    const timer = window.setTimeout(tick, 50);
    return () => window.clearTimeout(timer);
  }, [hidden, homeReady, manifest, state, visibleCommittedAt]);

  if (!shouldPresent || hidden || !manifest) return null;
  return (
    <div
      className="fixed inset-0 z-[2147483000] bg-[#0B421A]"
      data-r15-startup-owner="mounted"
      data-r15-startup-state={state}
      data-r15-startup-generation={paint.generationId}
    >
      <StartupPresentationRuntime
        paint={paint}
        assetSrc={assetSrc}
        onVisualCommit={markVisualCommit}
      />
    </div>
  );
}
