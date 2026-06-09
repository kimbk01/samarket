import { applyPreferredSinkToHtmlAudioElement } from "@/lib/permissions/speaker-output-preference";

const PLAY_VERIFY_TIMEOUT_MS = 2_500;

function waitForVideoElementPlayback(node: HTMLVideoElement, timeoutMs = PLAY_VERIFY_TIMEOUT_MS): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (node.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && node.videoWidth > 0) {
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      node.removeEventListener("loadeddata", onReady);
      node.removeEventListener("canplay", onReady);
      window.clearTimeout(timer);
      resolve(ok);
    };
    const onReady = () => {
      finish(node.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA || node.videoWidth > 0);
    };
    const timer = window.setTimeout(() => finish(false), timeoutMs);
    node.addEventListener("loadeddata", onReady);
    node.addEventListener("canplay", onReady);
  });
}

async function attemptPlay(node: HTMLMediaElement): Promise<boolean> {
  try {
    if (typeof HTMLAudioElement !== "undefined" && node instanceof HTMLAudioElement) {
      await applyPreferredSinkToHtmlAudioElement(node);
    }
    await node.play();
    if (node instanceof HTMLVideoElement) {
      return waitForVideoElementPlayback(node);
    }
    return true;
  } catch {
    return false;
  }
}

export async function bindMediaStreamToElement(
  node: HTMLMediaElement | null,
  stream: MediaStream | null,
  options?: { muted?: boolean }
): Promise<boolean> {
  if (!node) return false;
  if (node.srcObject !== stream) {
    node.srcObject = stream;
  }
  node.autoplay = true;
  if ("playsInline" in node) {
    (node as HTMLVideoElement).playsInline = true;
  }
  if (typeof options?.muted === "boolean") {
    node.muted = options.muted;
  }
  if (!stream) return false;

  let ok = await attemptPlay(node);
  if (ok) return true;

  await new Promise<void>((resolve) => {
    const onMeta = () => {
      node.removeEventListener("loadedmetadata", onMeta);
      node.removeEventListener("canplay", onMeta);
      resolve();
    };
    node.addEventListener("loadedmetadata", onMeta);
    node.addEventListener("canplay", onMeta);
    window.setTimeout(resolve, 120);
  });

  ok = await attemptPlay(node);
  return ok;
}

export function detachMediaStreamFromElement(node: HTMLMediaElement | null): void {
  if (!node) return;
  node.srcObject = null;
}
