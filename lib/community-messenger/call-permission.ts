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

function primedStreamIsUsableForKind(kind: CommunityMessengerCallKind): boolean {
  if (!primedDeviceStreamState || primedDeviceStreamState.kind !== kind) return false;
  const tracks = primedDeviceStreamState.stream.getTracks();
  return tracks.length > 0 && tracks.every((t) => t.readyState === "live");
}

function storePrimedStream(kind: CommunityMessengerCallKind, stream: MediaStream) {
  if (typeof window === "undefined") return;
  primedDeviceStreamState = {
    kind,
    stream,
    timeoutId: window.setTimeout(() => {
      clearPrimedDeviceStream(true);
    }, 20_000),
  };
}

/**
 * 전역 수신 배너에서 클릭으로 프라임한 뒤 방으로 이동하면, 자동 수락이 `useEffect`에서
 * 돌아 사용자 제스처가 없다. 이 경우 다시 `getUserMedia`를 호출하면 Chrome 등에서
 * NotAllowedError가 난다. 같은 종류의 프라임 스트림이 살아 있으면 덮어쓰지 않는다.
 *
 * 버튼 `onClick` 에서는 **`primeCommunityMessengerDevicePermissionFromUserGesture`** 를 쓴다.
 * `async` 핸들러에서 다른 `await` 뒤에 이 함수를 호출하면, 맥 크롬 등에서 제스처가 끊겨
 * `getUserMedia` 가 NotAllowedError 로 실패할 수 있다.
 */
export function primeCommunityMessengerDevicePermissionFromUserGesture(
  kind: CommunityMessengerCallKind
): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return Promise.resolve();
  }
  if (typeof window !== "undefined") {
    if (primedStreamIsUsableForKind(kind)) {
      return Promise.resolve();
    }
    clearPrimedDeviceStream(true);
  }
  return navigator.mediaDevices
    .getUserMedia({
      audio: true,
      video: kind === "video",
    })
    .then((stream) => {
      if (typeof window === "undefined") {
        for (const track of stream.getTracks()) {
          track.stop();
        }
        return;
      }
      storePrimedStream(kind, stream);
    });
}

export async function primeCommunityMessengerDevicePermission(kind: CommunityMessengerCallKind): Promise<void> {
  await primeCommunityMessengerDevicePermissionFromUserGesture(kind);
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
