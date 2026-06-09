import type { ILocalVideoTrack, IRemoteVideoTrack } from "agora-rtc-sdk-ng";
import { bindMediaStreamToElement, detachMediaStreamFromElement } from "@/lib/community-messenger/media-element";

const AGORA_PLAY_VERIFY_TIMEOUT_MS = 2_500;

let autoplayPrimingVideo: HTMLVideoElement | null = null;

function ensureAutoplayPrimingVideo(): HTMLVideoElement | null {
  if (typeof document === "undefined") return null;
  if (autoplayPrimingVideo && document.body.contains(autoplayPrimingVideo)) {
    return autoplayPrimingVideo;
  }
  const el = document.createElement("video");
  el.muted = true;
  el.playsInline = true;
  el.autoplay = true;
  el.setAttribute("playsinline", "true");
  el.style.position = "fixed";
  el.style.width = "1px";
  el.style.height = "1px";
  el.style.opacity = "0";
  el.style.pointerEvents = "none";
  el.style.left = "-9999px";
  el.style.top = "0";
  document.body.appendChild(el);
  autoplayPrimingVideo = el;
  return el;
}

/** CTA/수락 제스처 스택 — muted video play 로 autoplay gate 해제 (동기 play 시작) */
export function primeVideoElementAutoplayFromUserGesture(stream: MediaStream): boolean {
  if (typeof window === "undefined") return false;
  const el = ensureAutoplayPrimingVideo();
  if (!el) return false;
  if (el.srcObject !== stream) {
    el.srcObject = stream;
  }
  el.autoplay = true;
  el.muted = true;
  if ("playsInline" in el) {
    el.playsInline = true;
  }
  el.setAttribute("playsinline", "true");
  try {
    const playPromise = el.play();
    if (playPromise && typeof playPromise.catch === "function") {
      void playPromise.catch(() => {});
    }
  } catch {
    return false;
  }
  void bindMediaStreamToElement(el, stream, { muted: true });
  return true;
}

export function detachAutoplayPrimingVideo(): void {
  if (!autoplayPrimingVideo) return;
  detachMediaStreamFromElement(autoplayPrimingVideo);
}

export function shouldRetainPreJoinPreview(localVideoPlaying: boolean): boolean {
  return !localVideoPlaying;
}

export async function attachPreJoinHtmlVideo(
  el: HTMLVideoElement | null,
  stream: MediaStream | null
): Promise<boolean> {
  if (!el || !stream) return false;
  return bindMediaStreamToElement(el, stream, { muted: true });
}

export function detachPreJoinHtmlVideo(el: HTMLVideoElement | null): void {
  detachMediaStreamFromElement(el);
}

function waitForAgoraVideoInContainer(
  container: HTMLElement,
  timeoutMs = AGORA_PLAY_VERIFY_TIMEOUT_MS
): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  const started = Date.now();
  return new Promise((resolve) => {
    const tick = () => {
      const video = container.querySelector("video");
      if (video && (video.videoWidth > 0 || video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA)) {
        resolve(true);
        return;
      }
      if (Date.now() - started >= timeoutMs) {
        resolve(Boolean(video));
        return;
      }
      window.requestAnimationFrame(tick);
    };
    tick();
  });
}

export type BindAgoraVideoPlayOptions = {
  fit?: "cover" | "contain" | "fill";
  mirror?: boolean;
  timeoutMs?: number;
};

/** @deprecated `BindAgoraVideoPlayOptions` */
export type BindAgoraLocalVideoOptions = BindAgoraVideoPlayOptions;

/** Agora local video play — DOM 에 프레임이 붙을 때까지 검증 */
export async function bindAgoraLocalVideoTrack(
  track: ILocalVideoTrack | null,
  container: HTMLElement | null,
  options?: BindAgoraVideoPlayOptions
): Promise<boolean> {
  if (!track || !container) return false;
  if (!track.enabled) {
    container.innerHTML = "";
    return true;
  }
  try {
    track.play(container, {
      fit: options?.fit ?? "cover",
      mirror: options?.mirror ?? true,
    });
  } catch {
    return false;
  }
  return waitForAgoraVideoInContainer(container, options?.timeoutMs ?? AGORA_PLAY_VERIFY_TIMEOUT_MS);
}

/** Agora remote video play — 로컬과 동일하게 프레임 검증 */
export async function bindAgoraRemoteVideoTrack(
  track: IRemoteVideoTrack | null,
  container: HTMLElement | null,
  options?: BindAgoraVideoPlayOptions
): Promise<boolean> {
  if (!track || !container) return false;
  try {
    track.play(container, {
      fit: options?.fit ?? "cover",
      mirror: options?.mirror ?? false,
    });
  } catch {
    return false;
  }
  return waitForAgoraVideoInContainer(container, options?.timeoutMs ?? AGORA_PLAY_VERIFY_TIMEOUT_MS);
}

export function clearLocalVideoContainer(container: HTMLElement | null): void {
  if (!container) return;
  container.innerHTML = "";
}
