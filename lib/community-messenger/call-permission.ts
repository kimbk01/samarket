import { buildCommunityMessengerMediaStreamConstraints } from "@/lib/community-messenger/media-preflight";
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

function isIosChrome(): boolean {
  if (typeof window === "undefined") return false;
  return /iPhone|iPad|iPod/i.test(window.navigator.userAgent) && /CriOS/i.test(window.navigator.userAgent);
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
      : isIosChrome()
        ? kind === "video"
          ? "아이폰 Chrome에서는 통화 시작 시 뜨는 시스템 팝업에서 마이크(·카메라)를 허용해 주세요. `설정 > Chrome > 마이크`에서도 허용할 수 있습니다. 같은 탭에서 통화·채팅을 오갈 때 팝업이 다시 뜰 수 있으니, 한 번 허용한 뒤에는 탭을 유지해 주세요."
          : "아이폰 Chrome에서는 통화 시작 시 뜨는 시스템 팝업에서 마이크를 허용해 주세요. `설정 > Chrome > 마이크`에서도 허용할 수 있습니다. 연결에 실패하면 아래 「다시 시도」를 눌러 주세요."
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

/** 전역 수락 직후 방으로 이동했을 때 자동 수락 effect 가 getUserMedia 를 호출해도 되는지(프라임 성공 여부) */
export function hasUsablePrimedCommunityMessengerDeviceStream(kind: CommunityMessengerCallKind): boolean {
  return primedStreamIsUsableForKind(kind);
}

function storePrimedStream(kind: CommunityMessengerCallKind, stream: MediaStream) {
  if (typeof window === "undefined") return;
  primedDeviceStreamState = {
    kind,
    stream,
    /** 방↔통화 이동·토큰 요청 등으로 조인이 늦어져도 한 번 허용한 스트림을 재사용할 수 있게 여유를 둔다 */
    timeoutId: window.setTimeout(() => {
      clearPrimedDeviceStream(true);
    }, 90_000),
  };
}

/** 브라우저에 이미 거부로 기록된 경우 불필요한 getUserMedia 반복을 줄인다(지원 브라우저 한정). */
async function assertPersistentPermissionNotDenied(kind: CommunityMessengerCallKind): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.permissions?.query) return;
  try {
    const mic = await navigator.permissions.query({ name: "microphone" as PermissionName });
    if (mic.state === "denied") {
      throw new DOMException("Microphone permission denied", "NotAllowedError");
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === "NotAllowedError") throw e;
  }
  if (kind !== "video") return;
  try {
    const cam = await navigator.permissions.query({ name: "camera" as PermissionName });
    if (cam.state === "denied") {
      throw new DOMException("Camera permission denied", "NotAllowedError");
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === "NotAllowedError") throw e;
  }
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
  return assertPersistentPermissionNotDenied(kind)
    .then(() =>
      navigator.mediaDevices.getUserMedia(buildCommunityMessengerMediaStreamConstraints(kind))
    )
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
