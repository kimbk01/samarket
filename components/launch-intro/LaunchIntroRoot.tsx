"use client";

/**
 * DIBAY Intro — runtime root (contract §8–§11), mounted once in app/layout.tsx.
 *
 * - DEFERRED MOUNT: the route tree (Community and its providers) sits in a Suspense boundary that
 *   suspends while the Intro owns the launch. During hydration React keeps the server HTML
 *   dehydrated — no effects, no listeners, no popup / permission / navigation side effects —
 *   until the Intro exits (or aborts to COMMUNITY before the OS release).
 * - OS release owner = the selected destination only. INTRO releases on its first meaningful
 *   painted frame (scene image decoded from the verified local cache, then next frame).
 * - Exit latch: the first of CTA / complete / skip / background / error wins; later events ignored.
 * - Web / Windows / old native builds (no launch epoch): COMMUNITY, nothing is deferred.
 */
import { Component, Suspense, use, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { LaunchIntroSceneView } from "@/components/launch-intro/LaunchIntroSceneView";
import { invalidateLaunchIntroIndex, loadLaunchIntroAssetUrl } from "@/lib/launch-intro/cache";
import { startLaunchIntroDiscovery } from "@/lib/launch-intro/discovery";
import { markLaunchEpochShown } from "@/lib/launch-intro/launch-epoch";
import {
  abortLaunchIntroToCommunity,
  getLaunchDestination,
  getLaunchIntroDeferral,
  releaseLaunchIntroDeferral,
  type LaunchIntroSnapshot,
} from "@/lib/launch-intro/startup-destination";
import { releaseOsForLaunchIntro } from "@/lib/startup/startup-metrics";

function DeferredRouteTree({ children }: { children: ReactNode }) {
  const pending = getLaunchIntroDeferral();
  if (pending) use(pending);
  return <>{children}</>;
}

class IntroErrorBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(_e: unknown, _info: ErrorInfo) {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * Launch intent = a specific destination was requested by native (contract §8) → no Intro.
 * Read-only native calls, invoked directly on the plugin proxy (never resolved/awaited as a value:
 * Capacitor plugin proxies trap `then`, which would leave an awaiting promise unsettled).
 */
async function hasLaunchIntent(): Promise<string | null> {
  const { registerPlugin } = await import("@capacitor/core");
  try {
    const incoming = registerPlugin<{ getPendingPushRoute: () => Promise<{ path?: string }> }>("NativeIncomingCall");
    const pending = await incoming.getPendingPushRoute();
    if (typeof pending?.path === "string" && pending.path.trim().startsWith("/")) return "push_route";
  } catch {
    /* not implemented / unavailable → no push intent */
  }
  try {
    const app = registerPlugin<{ getLaunchUrl: () => Promise<{ url?: string } | undefined> }>("App");
    const launch = await app.getLaunchUrl();
    const url = launch?.url ?? "";
    if (url && !/^https:\/\/[^/]+\/?$/.test(url)) return "launch_url";
  } catch {
    /* ignore */
  }
  return null;
}

type Phase = "preparing" | "showing" | "exiting" | "done";

function LaunchIntroOverlay({ snapshot }: { snapshot: LaunchIntroSnapshot }) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const scene = snapshot.publication.document.scenes[0];
  const [phase, setPhase] = useState<Phase>("preparing");
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [exitTarget, setExitTarget] = useState<string | null>(null);
  const latched = useRef(false);
  const timer = useRef<number | null>(null);

  // PREPARING: launch intent + local verified asset + decode. Local only, no network.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const intent = await hasLaunchIntent();
      if (cancelled) return;
      if (intent) {
        abortLaunchIntroToCommunity(intent);
        setPhase("done");
        return;
      }
      let src: string | null = null;
      const asset = scene?.image
        ? snapshot.publication.assets.find((a) => a.sha256 === scene.image!.sha256)
        : null;
      if (scene?.image) {
        src = asset ? await loadLaunchIntroAssetUrl(asset) : null;
        if (!src) {
          invalidateLaunchIntroIndex();
          if (!cancelled) {
            abortLaunchIntroToCommunity("asset_missing");
            setPhase("done");
          }
          return;
        }
        try {
          const probe = new Image();
          probe.src = src;
          await probe.decode();
        } catch {
          invalidateLaunchIntroIndex();
          if (!cancelled) {
            abortLaunchIntroToCommunity("decode_failed");
            setPhase("done");
          }
          return;
        }
      }
      if (cancelled) return;
      setImageSrc(src);
      setPhase("showing");
    })();
    return () => {
      cancelled = true;
    };
  }, [scene, snapshot]);

  const exit = useCallback(
    (reason: "cta" | "complete" | "skip" | "background" | "error", target?: string) => {
      if (latched.current) return;
      latched.current = true;
      if (timer.current != null) window.clearTimeout(timer.current);
      console.info(`[dibay-launch-intro] exit reason=${reason}${target ? ` target=${target}` : ""}`);
      if (target) {
        const targetPath = target.split(/[?#]/)[0] || "/";
        router.replace(target);
        releaseLaunchIntroDeferral();
        if (targetPath === (pathname ?? "/")) setPhase("done");
        else {
          setExitTarget(targetPath);
          setPhase("exiting");
        }
        return;
      }
      releaseLaunchIntroDeferral();
      setPhase("done");
    },
    [pathname, router]
  );

  // CTA exit completes when the router has committed the target route.
  useEffect(() => {
    if (phase === "exiting" && exitTarget && pathname === exitTarget) setPhase("done");
  }, [exitTarget, pathname, phase]);

  // SHOWING: first meaningful frame painted → next frame → release the OS (INTRO owner only).
  useLayoutEffect(() => {
    if (phase !== "showing") return;
    const raf = requestAnimationFrame(() => {
      if (!releaseOsForLaunchIntro()) {
        abortLaunchIntroToCommunity("release_denied");
        setPhase("done");
        return;
      }
      markLaunchEpochShown(snapshot.epoch);
      // Scene duration is Admin content; it starts only after the OS release.
      timer.current = window.setTimeout(() => exit("complete"), scene.durationMs);
    });
    return () => cancelAnimationFrame(raf);
  }, [phase, scene, snapshot.epoch, exit]);

  useEffect(() => {
    if (phase !== "showing") return;
    const onVis = () => {
      if (document.visibilityState === "hidden") exit("background");
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [phase, exit]);

  useEffect(
    () => () => {
      if (timer.current != null) window.clearTimeout(timer.current);
      if (imageSrc) URL.revokeObjectURL(imageSrc);
    },
    [imageSrc]
  );

  if (!scene || phase === "done" || phase === "preparing") return null;

  return (
    <div
      data-launch-intro-overlay=""
      style={{ position: "fixed", inset: 0, zIndex: 2147483000, background: scene.background }}
    >
      <IntroErrorBoundary onError={() => exit("error")}>
        <LaunchIntroSceneView
          scene={scene}
          imageSrc={imageSrc}
          skipLabel={t("launch_intro_skip")}
          safeArea
          onCta={scene.cta ? () => exit("cta", scene.cta!.path) : undefined}
          onSkip={() => exit("skip")}
        />
      </IntroErrorBoundary>
    </div>
  );
}

function LaunchIntroHost() {
  const [snapshot, setSnapshot] = useState<LaunchIntroSnapshot | null>(null);
  useEffect(() => {
    startLaunchIntroDiscovery();
    const d = getLaunchDestination();
    if (d.destination === "intro" && d.snapshot) setSnapshot(d.snapshot);
  }, []);
  if (!snapshot) return null;
  return (
    <IntroErrorBoundary onError={() => abortLaunchIntroToCommunity("host_error")}>
      <LaunchIntroOverlay snapshot={snapshot} />
    </IntroErrorBoundary>
  );
}

export function LaunchIntroRoot({ children }: { children: ReactNode }) {
  return (
    <>
      <Suspense fallback={null}>
        <DeferredRouteTree>{children}</DeferredRouteTree>
      </Suspense>
      <LaunchIntroHost />
    </>
  );
}
