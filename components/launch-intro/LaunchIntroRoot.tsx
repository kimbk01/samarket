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
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { LaunchIntroPlayer } from "@/components/launch-intro/LaunchIntroPlayer";
import { invalidateLaunchIntroIndex, loadLaunchIntroAssetUrl } from "@/lib/launch-intro/cache";
import { launchIntroDocumentImageRefs, launchIntroDocumentVideoRefs } from "@/lib/launch-intro/document";
import { startLaunchIntroDiscovery } from "@/lib/launch-intro/discovery";
import { resolveDibayDeviceClass } from "@/lib/device/dibay-device-class";
import { recordLaunchIntroShown } from "@/lib/launch-intro/frequency";
import { launchIntroTargetMatches } from "@/lib/launch-intro/target";
import { markLaunchEpochShown } from "@/lib/launch-intro/launch-epoch";
import { LAUNCH_INTRO_PREPARE_TIMEOUT_MS, startLaunchIntroPrepareDeadline } from "@/lib/launch-intro/prepare-deadline";
import {
  abortLaunchIntroToCommunity,
  getLaunchDestination,
  getLaunchIntroDeferral,
  releaseLaunchIntroDeferral,
  type LaunchIntroSnapshot,
} from "@/lib/launch-intro/startup-destination";
import { onDestinationShellFrame } from "@/lib/launch-intro/os-release-owner";
import { hasLaunchIntent } from "@/lib/lifecycle/launch-intent.client";
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

type Phase = "preparing" | "showing" | "exiting" | "done";

function LaunchIntroOverlay({ snapshot }: { snapshot: LaunchIntroSnapshot }) {
  const { t } = useI18n();
  const router = useRouter();
  const doc = snapshot.publication.document;
  const [phase, setPhase] = useState<Phase>("preparing");
  const [imageSrcs, setImageSrcs] = useState<Record<string, string>>({});
  const [sceneIndex, setSceneIndex] = useState(0);
  const [released, setReleased] = useState(false);
  /** exit() 에서 읽는 해제 여부 — exit 는 [router] 로 고정돼 state 를 읽으면 오래된 값이 된다 */
  const releasedRef = useRef(false);
  const latched = useRef(false);

  // PREPARING: launch intent + every scene image from the verified local cache, decoded before the
  // first frame (scene changes never wait on media). Local only, no network.
  // Bounded by LAUNCH_INTRO_PREPARE_TIMEOUT_MS: a step that never settles (native plugin call, Cache
  // Storage, decode) hands the launch to COMMUNITY, so the start screen never stays (광고 감사 인트로).
  useEffect(() => {
    let cancelled = false;
    let committed = false;
    const created: string[] = [];
    const revokeCreated = () => {
      for (const src of created) URL.revokeObjectURL(src);
      created.length = 0;
    };
    const deadline = startLaunchIntroPrepareDeadline(() => {
      if (cancelled) return;
      console.info(`[dibay-launch-intro] prepare_timeout ms=${LAUNCH_INTRO_PREPARE_TIMEOUT_MS}`);
      revokeCreated();
      abortLaunchIntroToCommunity("prepare_timeout");
      setPhase("done");
    });
    /** Unmounted, or the deadline already sent the launch to COMMUNITY: nothing more may happen. */
    const stopped = () => cancelled || deadline.expired;
    /** Own abort (before the deadline). Not after unmount, not after the deadline fired. */
    const abort = (reason: string, invalidate: boolean) => {
      if (stopped() || !deadline.settle()) return;
      if (invalidate) invalidateLaunchIntroIndex();
      abortLaunchIntroToCommunity(reason);
      setPhase("done");
    };
    void (async () => {
      const intent = await hasLaunchIntent({ includeCallRoutes: true });
      if (stopped()) return;
      if (intent) {
        abort(intent, false);
        return;
      }
      // P7 device target: read the DeviceClass SSOT (read-only) only when the publication targets
      // phones or tablets. Not a match (or UNKNOWN) → COMMUNITY before the OS release, like an intent.
      const target = snapshot.publication.eligibility?.target;
      if (target) {
        const dc = await resolveDibayDeviceClass();
        if (stopped()) return;
        if (!launchIntroTargetMatches(target, dc.deviceClass)) {
          abort(`target_${target}_device_${dc.deviceClass}`, false);
          return;
        }
      }
      const srcs: Record<string, string> = {};
      for (const ref of launchIntroDocumentImageRefs(doc)) {
        if (srcs[ref.sha256]) continue;
        const asset = snapshot.publication.assets.find((a) => a.sha256 === ref.sha256);
        const src = asset ? await loadLaunchIntroAssetUrl(asset) : null;
        if (stopped()) {
          if (src) URL.revokeObjectURL(src);
          return;
        }
        if (!src) {
          abort("asset_missing", true);
          return;
        }
        created.push(src);
        try {
          const probe = new Image();
          probe.src = src;
          await probe.decode();
        } catch {
          abort("decode_failed", true);
          return;
        }
        if (stopped()) return;
        srcs[ref.sha256] = src;
      }
      // Videos: verified local object URLs only. Never decoded or awaited here — the poster above is
      // the first meaningful frame; playback starts after the OS release and may fail without effect.
      for (const ref of launchIntroDocumentVideoRefs(doc)) {
        if (srcs[ref.sha256]) continue;
        const asset = snapshot.publication.assets.find((a) => a.sha256 === ref.sha256);
        const src = asset ? await loadLaunchIntroAssetUrl(asset) : null;
        if (stopped()) {
          if (src) URL.revokeObjectURL(src);
          return;
        }
        if (!src) {
          // Incomplete cache = not a valid snapshot (promotion is all-or-nothing): same as a missing image.
          abort("asset_missing", true);
          return;
        }
        created.push(src);
        srcs[ref.sha256] = src;
      }
      if (stopped() || !deadline.settle()) return;
      committed = true;
      setImageSrcs(srcs);
      setPhase("showing");
    })();
    return () => {
      cancelled = true;
      deadline.cancel();
      // Object URLs handed to state are revoked by the imageSrcs cleanup; the rest here.
      if (!committed) revokeCreated();
    };
  }, [doc, snapshot]);

  useEffect(
    () => () => {
      for (const src of Object.values(imageSrcs)) URL.revokeObjectURL(src);
    },
    [imageSrcs]
  );

  const handoffOff = useRef<(() => void) | null>(null);

  /**
   * Exit latch: the first exit event wins. complete / skip / CTA route hand off to the destination:
   * the overlay stays until the destination shell has painted the target path
   * (onDestinationShellFrame), so the exit never reveals an empty document. The scene timer stops
   * because the Player only runs while SHOWING.
   */
  const exit = useCallback(
    (reason: "cta" | "complete" | "skip" | "background" | "error", target?: string) => {
      if (latched.current) {
        console.info(`[dibay-launch-intro] exit_ignored reason=${reason}`);
        return;
      }
      latched.current = true;
      console.info(`[dibay-launch-intro] exit reason=${reason}${target ? ` target=${target}` : ""}`);
      if (reason === "background" || reason === "error") {
        // Same epoch: do not re-show Intro after an interrupted USER_COLD Intro.
        markLaunchEpochShown(snapshot.epoch);
        if (releasedRef.current) {
          releaseLaunchIntroDeferral();
        } else {
          // 광고 감사 I-4: OS 해제 전 종료 — 해제 권한을 커뮤니티로 넘겨 첫 화면이 그려질 때 시작 화면을 닫게 한다
          // (넘기지 않으면 rAF 가 취소된 채 권한이 intro 에 남아 시작 화면이 닫히지 않는다).
          abortLaunchIntroToCommunity(`exit_${reason}_before_release`);
        }
        setPhase("done");
        return;
      }
      // CTA: wait for the exact target route; complete / skip: the first destination frame
      // (the app may apply its own initial surface after mount).
      const targetPath = target ? target.split(/[?#]/)[0] || "/" : null;
      handoffOff.current = onDestinationShellFrame((painted) => {
        if (targetPath && painted !== targetPath) return;
        handoffOff.current?.();
        handoffOff.current = null;
        setPhase("done");
      });
      setPhase("exiting");
      if (target) router.replace(target);
      releaseLaunchIntroDeferral();
    },
    [router]
  );
  useEffect(() => {
    console.info(`[dibay-launch-intro] phase=${phase}`);
  }, [phase]);

  const exitRef = useRef(exit);
  useLayoutEffect(() => {
    exitRef.current = exit;
  }, [exit]);

  // SHOWING: first meaningful frame painted → next frame → release the OS (INTRO owner only).
  // The scene timeline starts only after the OS release (scene durations are Admin content).
  useLayoutEffect(() => {
    if (phase !== "showing") return;
    const raf = requestAnimationFrame(() => {
      if (!releaseOsForLaunchIntro()) {
        abortLaunchIntroToCommunity("release_denied");
        setPhase("done");
        return;
      }
      releasedRef.current = true;
      markLaunchEpochShown(snapshot.epoch);
      // P6 consumption = this first frame (same instant as the epoch mark).
      if (snapshot.publication.eligibility?.frequency && snapshot.publication.eligibility.frequency !== "every_launch") {
        recordLaunchIntroShown(snapshot.publication.id, Date.now());
      }
      setReleased(true);
      console.info(`[dibay-launch-intro] released_os scenes=${doc.scenes.length} timer=${doc.scenes[0].durationMs}`);
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per SHOWING
  }, [phase]);

  useEffect(() => {
    if (phase !== "showing" && phase !== "exiting") return;
    const onVis = () => {
      if (document.visibilityState !== "hidden") return;
      if (phase === "exiting") setPhase("done");
      else exitRef.current("background");
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [phase]);

  useEffect(
    () => () => {
      handoffOff.current?.();
    },
    []
  );

  const onSceneIndexChange = useCallback((index: number) => {
    console.info(`[dibay-launch-intro] scene=${index}`);
    setSceneIndex(index);
  }, []);
  const onComplete = useCallback(() => {
    console.info("[dibay-launch-intro] complete_timer_fired");
    exitRef.current("complete");
  }, []);
  const onRoute = useCallback((path: string) => exitRef.current("cta", path), []);
  const onSkip = useCallback(() => exitRef.current("skip"), []);
  const resolveImage = useCallback((sha: string) => imageSrcs[sha] ?? null, [imageSrcs]);

  if (phase === "done" || phase === "preparing") return null;
  const scene = doc.scenes[Math.min(sceneIndex, doc.scenes.length - 1)];

  return (
    <div
      data-launch-intro-overlay=""
      data-launch-intro-phase={phase}
      // While handing off, a tap reveals the destination immediately (user-driven escape, no timer).
      onClick={phase === "exiting" ? () => setPhase("done") : undefined}
      style={{ position: "fixed", inset: 0, zIndex: 2147483000, background: scene.background.color }}
    >
      <IntroErrorBoundary onError={() => exit("error")}>
        <LaunchIntroPlayer
          document={doc}
          resolveImage={resolveImage}
          skipLabel={t("launch_intro_skip")}
          running={phase === "showing" && released}
          sceneIndex={sceneIndex}
          onSceneIndexChange={onSceneIndexChange}
          onComplete={onComplete}
          onRoute={onRoute}
          onSkip={onSkip}
          interactive={phase === "showing"}
          safeArea
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
