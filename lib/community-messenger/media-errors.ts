import type { CommunityMessengerCallKind } from "@/lib/community-messenger/types";

/** 토큰 API·클라이언트에서 동일하게 쓰는 설정 누락 식별 */
export function isCommunityMessengerCallProviderNotConfiguredError(error: unknown): boolean {
  const msg = extractErrorDetail(error);
  if (!msg) return false;
  return /통화 설정이 아직 연결되지|call_provider_not_configured|통화 설정이 아직 연결되지 않았습니다/i.test(msg);
}

/** 브라우저가 마이크·카메라를 허용하지 않는 출처(HTTP + LAN IP 등) */
export function isCommunityMessengerMediaBlockedByInsecureOrigin(): boolean {
  if (typeof window === "undefined") return false;
  if (window.isSecureContext) return false;
  const h = window.location.hostname;
  if (h === "localhost" || h === "127.0.0.1") return false;
  return true;
}

/** 통화(Agora) 차단 시 — 짧은 사용자 메시지·throw 공용 */
export const COMMUNITY_MESSENGER_HTTPS_REQUIRED_FOR_WEBRTC =
  "이 주소(HTTP·사설 IP)에서는 브라우저 보안 정책으로 영상·음성 통화(WebRTC)를 사용할 수 없습니다. PC: https://localhost:3000 또는 `npm run dev:https` 로 띄운 주소로 접속하세요. 휴대폰: 같은 Wi‑Fi에서도 HTTPS(역프록시·mkcert) 또는 터널링이 필요합니다.";

/**
 * Agora·WebRTC 호출 전에 사용. `http://LAN-IP` 는 `window.isSecureContext === false` 라
 * SDK가 `WEB_SECURITY_RESTRICT` 를 뿌리기 전에 막는다.
 */
export function assertCommunityMessengerWebRtcSecureContext(): void {
  if (typeof window === "undefined") return;
  if (!isCommunityMessengerMediaBlockedByInsecureOrigin()) return;
  throw new Error(COMMUNITY_MESSENGER_HTTPS_REQUIRED_FOR_WEBRTC);
}

/**
 * Agora 앱 ID 미설정 — 「장치 오류」가 아님. 배포·빌드 환경 변수 안내.
 * @see `NEXT_PUBLIC_COMMUNITY_MESSENGER_AGORA_APP_ID`, `COMMUNITY_MESSENGER_AGORA_APP_CERTIFICATE`
 */
export const COMMUNITY_MESSENGER_AGORA_SETUP_REQUIRED_MESSAGE =
  "통화 서비스(Agora)가 연결되지 않았습니다. 프로젝트 루트 `.env.local` 에 NEXT_PUBLIC_COMMUNITY_MESSENGER_AGORA_APP_ID=… 를 넣은 뒤 개발 서버를 재시작하세요(빌드된 클라이언트에는 빌드 시점 값이 박힙니다). 운영에서는 토큰 발급용 COMMUNITY_MESSENGER_AGORA_APP_CERTIFICATE 도 서버에 설정하세요.";

/** HTTP + LAN IP 등 비보안 출처 — UI 배너용 (한 줄 요약) */
export const COMMUNITY_MESSENGER_INSECURE_ORIGIN_MEDIA_HINT =
  "HTTP(예: 192.168.x.x:3000)에서는 브라우저가 마이크·카메라를 막습니다. `npm run dev:https` 로 띄운 뒤 터미널에 나온 https:// 주소로 접속하거나, PC에서는 localhost 로 접속하세요. 휴대폰·다른 기기는 HTTPS(역프록시·mkcert)가 필요합니다.";

const HTTPS_REQUIRED_FOR_MEDIA_MESSAGE = COMMUNITY_MESSENGER_HTTPS_REQUIRED_FOR_WEBRTC;

/** Agora join·publish 단계에서 네트워크·토큰 일시 오류 등 재시도할 만한 경우 */
export function isAgoraJoinRetryableError(error: unknown): boolean {
  if (isCommunityMessengerCallProviderNotConfiguredError(error)) return false;
  if (typeof error === "object" && error && "name" in error) {
    const n = String((error as { name?: unknown }).name ?? "");
    if (
      n === "NotAllowedError" ||
      n === "PermissionDeniedError" ||
      n === "NotFoundError" ||
      n === "DevicesNotFoundError" ||
      n === "NotReadableError" ||
      n === "TrackStartError" ||
      n === "OverconstrainedError"
    ) {
      return false;
    }
  }
  const codeRaw =
    typeof error === "object" && error && "code" in error ? (error as { code?: unknown }).code : undefined;
  const code = typeof codeRaw === "number" ? codeRaw : Number(codeRaw);
  if (Number.isFinite(code)) {
    /* Agora Web: 토큰·게이트웨이·네트워크 계열은 재시도 가치 있음(문서·버전마다 코드 상이) */
    if ([2, 109, 110, 111, 118, 119, 120, 501, 504, 506].includes(code)) return true;
  }
  const msg = String(error instanceof Error ? error.message : error);
  if (
    /token|invalid.*channel|network|timeout|unreachable|gateway|JOIN|failed to fetch|load failed|networkerror|502|503|504/i.test(
      msg
    )
  ) {
    return true;
  }
  return false;
}

function extractErrorDetail(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    const m = error.message.trim();
    return m.length > 140 ? `${m.slice(0, 137)}…` : m;
  }
  if (typeof error === "object" && error && "message" in error) {
    const m = String((error as { message?: unknown }).message ?? "").trim();
    if (m) return m.length > 140 ? `${m.slice(0, 137)}…` : m;
  }
  return "";
}

function isNotReadableMediaError(error: unknown): boolean {
  if (typeof error === "object" && error && "name" in error) {
    const n = String((error as { name?: unknown }).name ?? "");
    if (n === "NotReadableError" || n === "TrackStartError") return true;
  }
  const raw = error instanceof Error ? error.message : String(error);
  return /NotReadableError|NOT_READABLE|Could not start audio source/i.test(raw);
}

export function getCommunityMessengerMediaErrorMessage(
  error: unknown,
  kind: CommunityMessengerCallKind
): string {
  if (isCommunityMessengerCallProviderNotConfiguredError(error)) {
    return COMMUNITY_MESSENGER_AGORA_SETUP_REQUIRED_MESSAGE;
  }

  const rawForSecurity = error instanceof Error ? error.message : String(error);
  if (/WEB_SECURITY_RESTRICT|limited by web security|isSecureContext/i.test(rawForSecurity)) {
    return COMMUNITY_MESSENGER_HTTPS_REQUIRED_FOR_WEBRTC;
  }

  const name =
    typeof error === "object" && error && "name" in error
      ? String((error as { name?: unknown }).name ?? "")
      : "";

  if (isCommunityMessengerMediaBlockedByInsecureOrigin()) {
    if (name === "NotAllowedError" || name === "PermissionDeniedError") {
      return HTTPS_REQUIRED_FOR_MEDIA_MESSAGE;
    }
  }

  if (isNotReadableMediaError(error)) {
    return "다른 앱이 장치를 사용 중일 수 있습니다. 장치 점유를 해제한 뒤 다시 시도해 주세요.";
  }

  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return kind === "video"
      ? "카메라와 마이크 권한이 필요합니다. 브라우저 주소창 왼쪽의 사이트 설정에서 권한을 허용해 주세요."
      : "마이크 권한이 필요합니다. 브라우저 주소창 왼쪽의 사이트 설정에서 권한을 허용해 주세요.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return kind === "video"
      ? "사용 가능한 카메라 또는 마이크를 찾지 못했습니다."
      : "사용 가능한 마이크를 찾지 못했습니다.";
  }
  if (name === "AbortError") {
    return "장치 연결이 잠시 지연되고 있습니다. 잠시 후 다시 시도해 주세요.";
  }
  if (name === "OverconstrainedError") {
    return kind === "video"
      ? "카메라 또는 마이크 설정을 맞추지 못했습니다. 다른 장치를 선택하거나 권한을 다시 확인해 주세요."
      : "마이크 설정을 맞추지 못했습니다. 다른 장치를 선택하거나 권한을 다시 확인해 주세요.";
  }

  const detail = extractErrorDetail(error);
  if (detail) {
    return kind === "video"
      ? `영상 통화 장치 오류: ${detail}`
      : `음성 통화 장치 오류: ${detail}`;
  }
  return kind === "video"
    ? "영상 통화 장치 준비에 실패했습니다. 마이크·카메라 권한과 다른 앱의 장치 점유를 확인해 주세요."
    : "음성 통화 장치 준비에 실패했습니다. 마이크 권한과 다른 앱의 장치 점유를 확인해 주세요.";
}
