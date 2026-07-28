import { primeNotificationSoundAudio } from "@/lib/notifications/play-notification-sound";
import { applyPreferredSinkToHtmlAudioElement } from "@/lib/permissions/speaker-output-preference";
import {
  primeWebAudioCallToneContextFromUserGesture,
  startWebAudioCallTone,
} from "@/lib/community-messenger/call-tone-web-audio";
import type { CommunityMessengerCallKind } from "@/lib/community-messenger/types";
import {
  fetchMessengerCallSoundConfig,
  getMessengerCallSoundConfigCache,
  resolveMessengerCallEndSoundUrl,
  resolveMessengerCallMissedSoundUrl,
  resolveMessengerCallToneUrl,
} from "@/lib/community-messenger/messenger-call-sound-config-client";
import {
  callSsotEventKeyForTone,
  callSsotSignalHasPlayableUrl,
  ensureCallNotificationSsotHydrated,
  playCallNotificationSsotSignal,
  resolveCallNotificationSsotWebUrlSync,
} from "@/lib/community-messenger/call-ssot-notification-sound";
import { cmCallAudioCleanup, cmCallLatencyInfo } from "@/lib/community-messenger/cm-call-debug";
import { closePrimedWebAudioCallToneContext } from "@/lib/community-messenger/call-tone-web-audio";
import { resolveCallSoundPolicy } from "@/lib/notifications/call-sound-policy";
import { ensureNotificationSoundSsotHydratedForClient } from "@/lib/notifications/notification-sound-ssot-client-hydrate";

type CallToneMode = "incoming" | "outgoing";

export type CallToneController = {
  stop: () => void;
};

let activeToneStopper: (() => void) | null = null;

/**
 * `new Audio()` 로만 재생하는 링·원샷은 DOM 에 안 붙어 `querySelectorAll` 로 안 잡힘 — 추적 후 강제 정리.
 */
const detachedCommunityMessengerCallHtmlAudio = new Set<HTMLAudioElement>();

function trackDetachedCommunityMessengerCallAudio(el: HTMLAudioElement): void {
  detachedCommunityMessengerCallHtmlAudio.add(el);
}

function untrackDetachedCommunityMessengerCallAudio(el: HTMLAudioElement): void {
  detachedCommunityMessengerCallHtmlAudio.delete(el);
}

/** 링·통화 원샷 등 분리 HTMLAudio — 출력 장치 잔류 방지용 멱등 정리 */
export function forceKillDetachedCommunityMessengerCallHtmlAudio(): void {
  if (typeof window === "undefined") return;
  for (const el of [...detachedCommunityMessengerCallHtmlAudio]) {
    try {
      el.pause();
      el.srcObject = null;
      el.removeAttribute("src");
      const sink = el as HTMLAudioElement & { setSinkId?: (sinkId: string) => Promise<void> };
      if (typeof sink.setSinkId === "function") {
        void sink.setSinkId("").catch(() => {});
      }
      el.load();
    } catch {
      /* */
    }
    detachedCommunityMessengerCallHtmlAudio.delete(el);
  }
}

function stopActiveMessengerRingtoneLoop(): void {
  if (typeof window === "undefined") return;
  activeToneStopper?.();
  /** 링 Web Audio primed 컨텍스트도 같이 내려 스피커/BT 세션 잔류 완화 */
  closePrimedWebAudioCallToneContext();
}

/**
 * `startCommunityMessengerCallTone` 로 재생 중인 수·발신 링 루프만 중단한다.
 * Agora 통화 트랙과 동시에 재생되면 안 되므로 수락·조인 직전·종료 시 반드시 호출한다.
 */
export function stopCommunityMessengerCallTone(): void {
  cmCallAudioCleanup("stopCommunityMessengerCallTone", {});
  stopActiveMessengerRingtoneLoop();
}

/** 어디서든 호출 가능 — 통화 연결·종료·화면 전환 직후 벨이 남지 않게 한다 */
export function stopCommunityMessengerCallFeedback(): void {
  cmCallAudioCleanup("stopCommunityMessengerCallFeedback", {});
  stopActiveMessengerRingtoneLoop();
}

const CM_OUTGOING_RING_SKIP_DUP_KEY = "cm_outgoing_ring_skip_dup";

/**
 * 발신 버튼 핸들러에서 `await` 전에만 호출 — 사용자 활성이 남아 있는 동안 Web Audio 링백만 즉시 시작한다.
 * (`startCommunityMessengerCallTone` 의 설정 fetch await 으로 제스처가 끊기는 문제 완화)
 */
export function primeOutgoingRingbackWebAudioFromUserGesture(callKind: CommunityMessengerCallKind): void {
  if (typeof window === "undefined") return;
  activeToneStopper?.();
  primeWebAudioCallToneContextFromUserGesture();
  const kind: "voice" | "video" = callKind === "video" ? "video" : "voice";
  const web = startWebAudioCallTone("outgoing", kind);
  if (!web) return;
  const stop = () => {
    web.stop();
    if (activeToneStopper === stop) activeToneStopper = null;
  };
  activeToneStopper = stop;
}

/** 통화 페이지가 같은 세션으로 올라오면 effect 중복 시작 방지 */
export function rememberOutgoingRingtonePrimedForSession(sessionId: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(CM_OUTGOING_RING_SKIP_DUP_KEY, sessionId);
  } catch {
    /* */
  }
}

export function consumeOutgoingRingtonePrimedSessionFlag(sessionId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const v = sessionStorage.getItem(CM_OUTGOING_RING_SKIP_DUP_KEY);
    if (v !== sessionId) return false;
    sessionStorage.removeItem(CM_OUTGOING_RING_SKIP_DUP_KEY);
    return true;
  } catch {
    return false;
  }
}

function resolveAutoplayPrimingUrl(): string | null {
  void ensureNotificationSoundSsotHydratedForClient();
  return (
    resolveCallNotificationSsotWebUrlSync(callSsotEventKeyForTone("incoming", "voice")) ??
    resolveCallNotificationSsotWebUrlSync("system_default")
  );
}

/**
 * 통화 발신 직전(세션 POST·라우팅 `await` 전) **동기 제스처**에서 호출한다.
 * 이후 통화 화면 effect 에서 `HTMLAudioElement.play()`·Web Audio 가 막히지 않게 한다.
 */
export function unlockCommunityMessengerCallPlaybackFromUserGesture(): void {
  if (typeof window === "undefined") return;
  cmCallLatencyInfo("audio_unlock_start", {});
  primeWebAudioCallToneContextFromUserGesture();
  const primingUrl = resolveAutoplayPrimingUrl();
  if (primingUrl) {
    try {
      const a = new Audio(primingUrl);
      trackDetachedCommunityMessengerCallAudio(a);
      a.preload = "auto";
      a.muted = true;
      a.volume = 0;
      void a.play().then(
        () => {
          a.pause();
          a.currentTime = 0;
          untrackDetachedCommunityMessengerCallAudio(a);
        },
        () => {
          untrackDetachedCommunityMessengerCallAudio(a);
          if (typeof process !== "undefined" && process.env.NODE_ENV === "development") {
            console.warn("[community-messenger-call] muted HTMLAudio priming play rejected (autoplay policy)");
          }
        }
      );
    } catch {
      if (typeof process !== "undefined" && process.env.NODE_ENV === "development") {
        console.warn("[community-messenger-call] HTMLAudio priming threw");
      }
    }
  }
  cmCallLatencyInfo("audio_unlock_done", {});
}

export type StartCallToneOptions = {
  /** 음성/영상에 따라 다른 주파수·간격(동종 메신저처럼 구분). 기본 `voice`. */
  callKind?: CommunityMessengerCallKind;
};

function noopCallToneController(): CallToneController {
  const stop = () => {
    if (activeToneStopper === stop) activeToneStopper = null;
  };
  activeToneStopper = stop;
  return { stop };
}

/**
 * 수신/발신 통화 톤. SSOT URL → Web Audio 합성 순. legacy wav 루프 폴백 없음.
 * 관리자 설정 URL은 fetch 완료 후 적용되도록 비동기로 로드한다.
 */
export async function startCommunityMessengerCallTone(
  mode: CallToneMode,
  options?: StartCallToneOptions
): Promise<CallToneController> {
  if (typeof window === "undefined") {
    return { stop() {} };
  }

  activeToneStopper?.();

  cmCallAudioCleanup("ringtone_start", {
    mode,
    callKind: options?.callKind === "video" ? "video" : "voice",
  });

  await ensureCallNotificationSsotHydrated();

  primeNotificationSoundAudio();
  /**
   * 유지 이유: 수신 벨은 사용자 제스처 없이 시작되는 경우가 많아, 설정 API(await)가 벨 첫 재생을 막으면 체감 지연이 커진다.
   * `void fetch`로 최신 관리자 음원은 백그라운드 반영하고, 첫 틱은 캐시·합성/HTML 경로로 즉시 시작한다.
   */
  void fetchMessengerCallSoundConfig({ force: true });

  const cfg = getMessengerCallSoundConfigCache();
  const callKind: CommunityMessengerCallKind = options?.callKind === "video" ? "video" : "voice";
  const volCfg = cfg?.incoming_ringtone_volume;
  const vIn =
    typeof volCfg === "number" && Number.isFinite(volCfg) ? Math.min(1, Math.max(0, volCfg)) : 0.72;
  const vOut = Math.min(1, vIn * 0.625);
  const ssotEventKey = callSsotEventKeyForTone(mode, callKind);

  const policy = resolveCallSoundPolicy(ssotEventKey, { platform: "web" });
  if (policy.mode === "silent" || !policy.enabled) {
    return noopCallToneController();
  }

  const ssotUrl = policy.mode === "custom" ? policy.webUrl : null;
  const adminUrl =
    ssotUrl ??
    (policy.mode === "custom" ? resolveMessengerCallToneUrl(cfg, mode, callKind) : null);
  if (adminUrl) {
    let audio: HTMLAudioElement | null = null;
    const clear = () => {
      if (audio) {
        untrackDetachedCommunityMessengerCallAudio(audio);
        audio.pause();
        audio.currentTime = 0;
        audio = null;
      }
    };
    primeNotificationSoundAudio();
    for (const useCrossOrigin of [true, false] as const) {
      let next: HTMLAudioElement | null = null;
      try {
        next = new Audio(adminUrl);
        trackDetachedCommunityMessengerCallAudio(next);
        if (useCrossOrigin) next.crossOrigin = "anonymous";
        next.preload = "auto";
        next.loop = true;
        next.volume = mode === "incoming" ? vIn : vOut;
        /** 링/링백은 기본 출력 — setSinkId 가 BT·통화 오디오 모드로 끌어올리는 것을 피함 */
        await next.play();
        audio = next;
        const stop = () => {
          clear();
          if (activeToneStopper === stop) activeToneStopper = null;
        };
        activeToneStopper = stop;
        return { stop };
      } catch {
        if (next) untrackDetachedCommunityMessengerCallAudio(next);
        clear();
      }
    }
    // custom URL load failed → default WebAudio (same as Android custom→default)
  }

  // enabled + default (or custom load fail): WebAudio synthesis — CONTRACT explicit fallback
  const web = startWebAudioCallTone(mode, callKind);
  if (web) {
    const stop = () => {
      web.stop();
      if (activeToneStopper === stop) activeToneStopper = null;
    };
    activeToneStopper = stop;
    return { stop };
  }

  return noopCallToneController();
}

export type CallSignalSoundKind = "missed" | "call_end" | "rejected" | "cancelled";

const recentSignalPlays = new Map<string, number>();
const SIGNAL_DEDUP_MS = 3500;

export type PlayCallSignalSoundOptions = {
  /** 동일 세션에서 전역 배너·통화 화면 등 중복 재생 방지 */
  dedupeSessionId?: string;
};

async function playCallSignalLegacyUrlFallback(
  kind: CallSignalSoundKind,
  cfg: ReturnType<typeof getMessengerCallSoundConfigCache>
): Promise<void> {
  const legacyKind = kind === "missed" ? "missed" : "call_end";
  const url =
    legacyKind === "missed"
      ? resolveMessengerCallMissedSoundUrl(cfg)
      : resolveMessengerCallEndSoundUrl(cfg);
  if (!url) return;
  primeNotificationSoundAudio();
  try {
    const audio = new Audio(url);
    trackDetachedCommunityMessengerCallAudio(audio);
    audio.crossOrigin = "anonymous";
    audio.volume = legacyKind === "missed" ? 0.68 : 0.42;
    await applyPreferredSinkToHtmlAudioElement(audio);
    const done = () => untrackDetachedCommunityMessengerCallAudio(audio);
    audio.addEventListener("ended", done, { once: true });
    audio.addEventListener("error", done, { once: true });
    await audio.play();
  } catch {
    /* SSOT already attempted */
  }
}

/** 부재·종료·거절·취소 원샷 — admin SSOT `playEventNotificationSound` 우선, legacy URL은 폴백. */
export async function playCommunityMessengerCallSignalSound(
  kind: CallSignalSoundKind,
  options?: PlayCallSignalSoundOptions
): Promise<void> {
  if (typeof window === "undefined") return;
  const dk = options?.dedupeSessionId ? `${options.dedupeSessionId}:${kind}` : null;
  if (dk) {
    const now = Date.now();
    const last = recentSignalPlays.get(dk) ?? 0;
    if (now - last < SIGNAL_DEDUP_MS) return;
    recentSignalPlays.set(dk, now);
    if (recentSignalPlays.size > 80) {
      const cutoff = now - SIGNAL_DEDUP_MS * 4;
      for (const [k, t] of recentSignalPlays) {
        if (t < cutoff) recentSignalPlays.delete(k);
      }
    }
  }

  const ssotKind =
    kind === "call_end" ? "call_end" : kind === "rejected" ? "rejected" : kind === "cancelled" ? "cancelled" : "missed";

  await ensureCallNotificationSsotHydrated();
  if (callSsotSignalHasPlayableUrl(ssotKind)) {
    await playCallNotificationSsotSignal(ssotKind);
    return;
  }

  void fetchMessengerCallSoundConfig({ force: true });
  const cfg = getMessengerCallSoundConfigCache();
  await playCallSignalLegacyUrlFallback(kind, cfg);
}
