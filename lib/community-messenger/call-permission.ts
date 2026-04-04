import type { CommunityMessengerCallKind } from "@/lib/community-messenger/types";

type PrimedDeviceStreamState = {
  kind: CommunityMessengerCallKind;
  stream: MediaStream;
  timeoutId: number;
} | null;

let primedDeviceStreamState: PrimedDeviceStreamState = null;

function isIosSafari(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  const isIos = /iPhone|iPad|iPod/i.test(ua);
  const isWebkit = /WebKit/i.test(ua);
  const isCriOS = /CriOS|FxiOS|EdgiOS|OPT\//i.test(ua);
  return isIos && isWebkit && !isCriOS;
}

function isAndroid(): boolean {
  if (typeof window === "undefined") return false;
  return /Android/i.test(window.navigator.userAgent);
}

function isWindows(): boolean {
  if (typeof window === "undefined") return false;
  return /Windows/i.test(window.navigator.userAgent);
}

export function getCommunityMessengerPermissionGuide(kind: CommunityMessengerCallKind): {
  description: string;
  retryLabel: string;
  settingsLabel: string;
} {
  const baseDescription =
    kind === "video"
      ? "카메라와 마이크 권한이 꺼져 있으면 브라우저 주소창 왼쪽의 사이트 설정에서 카메라와 마이크를 허용해 주세요."
      : "마이크 권한이 꺼져 있으면 브라우저 주소창 왼쪽의 사이트 설정에서 마이크를 허용해 주세요.";
  const androidDescription =
    kind === "video"
      ? "안드로이드에서는 브라우저 주소창의 사이트 정보에서 카메라와 마이크를 허용하고, 필요하면 `설정 > 앱 > 브라우저 > 권한`에서도 카메라와 마이크를 허용해 주세요."
      : "안드로이드에서는 브라우저 주소창의 사이트 정보에서 마이크를 허용하고, 필요하면 `설정 > 앱 > 브라우저 > 권한`에서 마이크를 허용해 주세요.";
  const windowsDescription =
    kind === "video"
      ? "윈도우에서는 브라우저 주소창의 사이트 권한을 허용하고, 필요하면 `Windows 설정 > 개인정보 및 보안 > 카메라/마이크`에서 브라우저 접근을 허용해 주세요."
      : "윈도우에서는 브라우저 주소창의 사이트 권한을 허용하고, 필요하면 `Windows 설정 > 개인정보 및 보안 > 마이크`에서 브라우저 접근을 허용해 주세요.";
  return {
    description: isIosSafari()
      ? kind === "video"
        ? "아이폰 Safari에서는 주소창의 `aA` 또는 페이지 왼쪽 사이트 설정에서 카메라와 마이크를 허용하고, 필요하면 `설정 > Safari > 카메라/마이크`에서도 허용해 주세요."
        : "아이폰 Safari에서는 주소창의 `aA` 또는 페이지 왼쪽 사이트 설정에서 마이크를 허용하고, 필요하면 `설정 > Safari > 마이크`에서도 허용해 주세요."
      : isAndroid()
        ? androidDescription
        : isWindows()
          ? windowsDescription
      : baseDescription,
    retryLabel: kind === "video" ? "카메라/마이크 확인" : "마이크 확인",
    settingsLabel: "권한 설정 안내",
  };
}

export function openCommunityMessengerPermissionSettings(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent.toLowerCase();
  const origin = window.location.origin;

  try {
    if (ua.includes("edg/")) {
      window.open(`edge://settings/content/siteDetails?site=${encodeURIComponent(origin)}`, "_blank", "noopener,noreferrer");
      return true;
    }
    if (ua.includes("chrome") || ua.includes("whale") || ua.includes("opr/")) {
      window.open(`chrome://settings/content/siteDetails?site=${encodeURIComponent(origin)}`, "_blank", "noopener,noreferrer");
      return true;
    }
    if (ua.includes("firefox")) {
      window.open("about:preferences#privacy", "_blank", "noopener,noreferrer");
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

function clearPrimedDeviceStream(stopTracks: boolean) {
  if (!primedDeviceStreamState) return;
  window.clearTimeout(primedDeviceStreamState.timeoutId);
  if (stopTracks) {
    for (const track of primedDeviceStreamState.stream.getTracks()) {
      track.stop();
    }
  }
  primedDeviceStreamState = null;
}

export async function primeCommunityMessengerDevicePermission(kind: CommunityMessengerCallKind): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return;
  if (typeof window !== "undefined") {
    clearPrimedDeviceStream(true);
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: true,
    video: kind === "video",
  });
  if (typeof window === "undefined") {
    for (const track of stream.getTracks()) {
      track.stop();
    }
    return;
  }
  primedDeviceStreamState = {
    kind,
    stream,
    timeoutId: window.setTimeout(() => {
      clearPrimedDeviceStream(true);
    }, 20_000),
  };
}

export function consumePrimedCommunityMessengerDevicePermission(
  kind: CommunityMessengerCallKind
): MediaStream | null {
  if (typeof window === "undefined" || !primedDeviceStreamState) return null;
  if (primedDeviceStreamState.kind !== kind) return null;
  const stream = primedDeviceStreamState.stream;
  clearPrimedDeviceStream(false);
  return stream;
}

export function discardPrimedCommunityMessengerDevicePermission() {
  if (typeof window === "undefined") return;
  clearPrimedDeviceStream(true);
}
