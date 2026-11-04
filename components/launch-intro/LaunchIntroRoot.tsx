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
import {
  isLaunchIntroCtaRoutePath,
  launchIntroDocumentImageRefs,
  launchIntroDocumentVideoRefs,
} from "@/lib/launch-intro/document";
import { startLaunchIntroDiscovery } from "@/lib/launch-intro/discovery";
import { resolveDibayDeviceClass } from "@/lib/device/dibay-device-class";
import { recordLaunchIntroShown } from "@/lib/launch-intro/frequency";
import { launchIntroTargetMatches } from "@/lib/launch-intro/target";
import { markLaunchEpochShown } from "@/lib/launch-intro/launch-epoch";
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
import { recordPromotionContentVisitClient } from "@/lib/platform-promotion-lifecycle/client-record-content-visit";
import { extractEventIdFromHref } from "@/lib/platform-promotion-lifecycle/content-visit-contract";

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
  // 광고 ② IN-S11 · D-16: 준비 전체를 try/catch/finally 로 — 예상 밖 예외는 커뮤니티로 넘긴다
  // (커뮤니티 첫 화면이 시작 화면을 닫는다). 시간 제한·타이머가 아니다(Owner 결정 4).
  // 광고 ② IN-S10 · D-17: 준비 중 백그라운드가 되면 준비를 멈추고(AbortController) 커뮤니티로 넘긴다.
  // 같은 epoch 에는 다시 보이지 않는다(I-4 표와 같음).
  useEffect(() => {
    const ac = new AbortController();
    const { signal } = ac;
    let committed = false;
    let settled = false;
    const created: string[] = [];
    /** 준비 단계 종료(해제 전) — 커뮤니티로 넘기고 이 실행에서는 인트로를 다시 보이지 않는다 */
    const handoff = (reason: string, markEpoch: boolean) => {
      if (settled) return;
      settled = true;
      if (markEpoch) markLaunchEpochShown(snapshot.epoch);
      abortLaunchIntroToCommunity(reason);
      setPhase("done");
    };
    const onHidden = () => {
      if (document.visibilityState !== "hidden" || settled || signal.aborted) return;
      console.info("[dibay-launch-intro] preparing_background");
      ac.abort();
      handoff("background_preparing", true);
    };
    document.addEventListener("visibilitychange", onHidden);
    void (async () => {
      try {
        const intent = await hasLaunchIntent({ includeCallRoutes: true });
        if (signal.aborted) return;
        if (intent) {
          handoff(intent, false);
          return;
        }
        // P7 device target: read the DeviceClass SSOT (read-only) only when the publication targets
        // phones or tablets. Not a match (or UNKNOWN) → COMMUNITY before the OS release, like an intent.
        const target = snapshot.publication.eligibility?.target;
        if (target) {
          const dc = await resolveDibayDeviceClass();
          if (signal.aborted) return;
          if (!launchIntroTargetMatches(target, dc.deviceClass)) {
            handoff(`target_${target}_device_${dc.deviceClass}`, false);
            return;
          }
        }
        const srcs: Record<string, string> = {};
        for (const ref of launchIntroDocumentImageRefs(doc)) {
          if (srcs[ref.sha256]) continue;
          const asset = snapshot.publication.assets.find((a) => a.sha256 === ref.sha256);
          const src = asset ? await loadLaunchIntroAssetUrl(asset) : null;
          if (signal.aborted) {
            // 정리(cleanup)가 이미 돌았으면 여기서 바로 해제한다.
            if (src) URL.revokeObjectURL(src);
            return;
          }
          if (src) created.push(src);
          if (!src) {
            invalidateLaunchIntroIndex();
            handoff("asset_missing", false);
            return;
          }
          try {
            const probe = new Image();
            probe.src = src;
            await probe.decode();
          } catch {
            if (signal.aborted) return;
            invalidateLaunchIntroIndex();
            handoff("decode_failed", false);
            return;
          }
          if (signal.aborted) return;
          srcs[ref.sha256] = src;
        }
        // Videos: verified local object URLs only. Never decoded or awaited here — the poster above is
        // the first meaningful frame; playback starts after the OS release and may fail without effect.
        for (const ref of launchIntroDocumentVideoRefs(doc)) {
          if (srcs[ref.sha256]) continue;
          const asset = snapshot.publication.assets.find((a) => a.sha256 === ref.sha256);
          const src = asset ? await loadLaunchIntroAssetUrl(asset) : null;
          if (signal.aborted) {
            // 정리(cleanup)가 이미 돌았으면 여기서 바로 해제한다.
            if (src) URL.revokeObjectURL(src);
            return;
          }
          if (src) created.push(src);
          if (!src) {
            // Incomplete cache = not a valid snapshot (promotion is all-or-nothing): same as a missing image.
            invalidateLaunchIntroIndex();
            handoff("asset_missing", false);
            return;
          }
          srcs[ref.sha256] = src;
        }
        if (signal.aborted || settled) return;
        committed = true;
        settled = true;
        setImageSrcs(srcs);
        setPhase("showing");
      } catch (e) {
        if (signal.aborted) return;
        console.warn(`[dibay-launch-intro] prepare_exception ${e instanceof Error ? e.name : typeof e}`);
        handoff("prepare_exception", true);
      } finally {
        // 준비가 끝나면(성공·실패·예외) 준비 단계 백그라운드 감지를 뗀다 — SHOWING 이후는 아래 감지가 맡는다.
        document.removeEventListener("visibilitychange", onHidden);
      }
    })();
    return () => {
      // 언마운트·StrictMode 재실행: 준비만 멈춘다(넘김은 호스트 오류 경계·다음 실행이 맡는다).
      ac.abort();
      document.removeEventListener("visibilitychange", onHidden);
      // Object URLs handed to state are revoked by the imageSrcs cleanup; the rest here.
      if (!committed) for (const src of created) URL.revokeObjectURL(src);
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
   * the overlay stays until the destination shell has painted (CTA: the target path, or any path
   * after navigation left the start path — DS-8) (onDestinationShellFrame), so the exit never
   * reveals an empty document. The scene timer stops
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
      // complete / skip: the first destination frame (the app may apply its own initial surface after mount).
      // CTA (광고 ② DS-8): 「이동 시작 + 다음 화면 그림」 — 목표 주소가 그려지거나, 이동이 시작돼 주소가
      // 시작 주소를 떠난 뒤 그려진 첫 화면에서 닫는다. 목표가 다른 주소로 넘어가도(로그인·리다이렉트)
      // exiting 오버레이가 남지 않는다.
      const targetPath = target ? target.split(/[?#]/)[0] || "/" : null;
      const startPath = typeof window !== "undefined" ? window.location.pathname : null;
      handoffOff.current = onDestinationShellFrame((painted) => {
        if (targetPath && painted !== targetPath && painted === startPath) return;
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
  // DS-8: 이미 받아 둔 옛 게시본의 CTA 도 회원 금지 경로(/admin 등)·잘못된 주소로는 보내지 않는다 — 건너뛰기와 같다.
  // IN-N3 · CX-02 (2026-11-04): CTA 목적지가 이벤트(/events/{id})면 콘텐츠 방문 기록(출처 INTRO) 1회 — 이동은 그대로
  // router.replace(시작 화면 뒤로가기로 인트로에 돌아오지 않게). 기록은 fire-and-forget 이라 이동을 막지 않는다.
  const onRoute = useCallback((path: string) => {
    if (!isLaunchIntroCtaRoutePath(path)) {
      exitRef.current("skip");
      return;
    }
    if (extractEventIdFromHref(path)) {
      recordPromotionContentVisitClient({ hrefOrEventId: path, sourceChannel: "INTRO" });
    }
    exitRef.current("cta", path);
  }, []);
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
