import type { CommunityMessengerCallKind } from "@/lib/community-messenger/types";
import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import { translate, type MessageKey } from "@/lib/i18n/messages";
import type { AppLanguageCode } from "@/lib/i18n/config";

/** 토큰 API·클라이언트에서 동일하게 쓰는 설정 누락 식별 */
export function isCommunityMessengerCallProviderNotConfiguredError(error: unknown): boolean {
  const msg = extractErrorDetail(error);
  if (!msg) return false;
  return (
    /call_provider_not_configured|통화 설정이 아직 연결되지|call service \(agora\) is not configured/i.test(msg) ||
    matchesMediaMessageKey(msg, "cm_ui_media_agora_setup_required")
  );
}

/** IPv6 루프백 등 — `window.location.hostname` 은 `[::1]` 또는 `::1` 형태가 혼재한다 */
export function isCommunityMessengerLoopbackHostname(hostname: string): boolean {
  const h = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "::1";
}

/** 브라우저가 마이크·카메라를 허용하지 않는 출처(HTTP + LAN IP 등). localhost / 127.0.0.1 / ::1 은 예외 */
export function isCommunityMessengerMediaBlockedByInsecureOrigin(): boolean {
  if (typeof window === "undefined") return false;
  if (window.isSecureContext) return false;
  const h = window.location.hostname;
  if (isCommunityMessengerLoopbackHostname(h)) return false;
  return true;
}

const MEDIA_MESSAGE_KEYS = {
  httpsRequired: "cm_ui_media_https_required",
  agoraSetup: "cm_ui_media_agora_setup_required",
  insecureHint: "cm_ui_media_insecure_origin_hint",
} as const satisfies Record<string, MessageKey>;

function mediaMessage(lang: AppLanguageCode, key: MessageKey): string {
  return translate(lang, key);
}

function matchesMediaMessageKey(message: string, key: MessageKey): boolean {
  return message === mediaMessage("ko", key) || message === mediaMessage("en", key);
}

/** 통화(Agora) 차단 시 — 짧은 사용자 메시지·throw 공용 */
export function getCommunityMessengerHttpsRequiredForWebRtc(): string {
  return mediaMessage(getRuntimeAppLanguage(), MEDIA_MESSAGE_KEYS.httpsRequired);
}

/** @deprecated 호환 — 런타임 언어 반영 문자열. 새 코드는 `getCommunityMessengerHttpsRequiredForWebRtc()` 사용 */
export const COMMUNITY_MESSENGER_HTTPS_REQUIRED_FOR_WEBRTC = mediaMessage("ko", MEDIA_MESSAGE_KEYS.httpsRequired);

/**
 * Agora·WebRTC 호출 전에 사용. `http://LAN-IP` 는 `window.isSecureContext === false` 라
 * SDK가 `WEB_SECURITY_RESTRICT` 를 뿌리기 전에 막는다.
 */
export function assertCommunityMessengerWebRtcSecureContext(): void {
  if (typeof window === "undefined") return;
  if (!isCommunityMessengerMediaBlockedByInsecureOrigin()) return;
  throw new Error(getCommunityMessengerHttpsRequiredForWebRtc());
}

/**
 * Agora 앱 ID 미설정 — 「장치 오류」가 아님. 배포·빌드 환경 변수 안내.
 * @see `NEXT_PUBLIC_COMMUNITY_MESSENGER_AGORA_APP_ID`, `COMMUNITY_MESSENGER_AGORA_APP_CERTIFICATE`
 */
export function getCommunityMessengerAgoraSetupRequiredMessage(): string {
  return mediaMessage(getRuntimeAppLanguage(), MEDIA_MESSAGE_KEYS.agoraSetup);
}

/** @deprecated 호환 — 런타임 언어 반영은 `getCommunityMessengerAgoraSetupRequiredMessage()` */
export const COMMUNITY_MESSENGER_AGORA_SETUP_REQUIRED_MESSAGE = mediaMessage("ko", MEDIA_MESSAGE_KEYS.agoraSetup);

/** HTTP + LAN IP 등 비보안 출처 — UI 배너용 (한 줄 요약) */
export function getCommunityMessengerInsecureOriginMediaHint(): string {
  return mediaMessage(getRuntimeAppLanguage(), MEDIA_MESSAGE_KEYS.insecureHint);
}

/** @deprecated 호환 — 런타임 언어 반영은 `getCommunityMessengerInsecureOriginMediaHint()` */
export const COMMUNITY_MESSENGER_INSECURE_ORIGIN_MEDIA_HINT = mediaMessage("ko", MEDIA_MESSAGE_KEYS.insecureHint);

/** 환경·설정 문제로 「다시 시도」가 의미 없는 통화 오류 문구 */
export function isCommunityMessengerNonRetryableCallErrorMessage(message: string | null | undefined): boolean {
  if (!message) return false;
  return (
    matchesMediaMessageKey(message, MEDIA_MESSAGE_KEYS.httpsRequired) ||
    matchesMediaMessageKey(message, MEDIA_MESSAGE_KEYS.agoraSetup)
  );
}

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
  const lang = getRuntimeAppLanguage();

  if (isCommunityMessengerCallProviderNotConfiguredError(error)) {
    return mediaMessage(lang, MEDIA_MESSAGE_KEYS.agoraSetup);
  }

  const rawForSecurity = error instanceof Error ? error.message : String(error);
  if (/WEB_SECURITY_RESTRICT|limited by web security|isSecureContext/i.test(rawForSecurity)) {
    return mediaMessage(lang, MEDIA_MESSAGE_KEYS.httpsRequired);
  }

  const name =
    typeof error === "object" && error && "name" in error
      ? String((error as { name?: unknown }).name ?? "")
      : "";

  if (isCommunityMessengerMediaBlockedByInsecureOrigin()) {
    if (name === "NotAllowedError" || name === "PermissionDeniedError") {
      return mediaMessage(lang, MEDIA_MESSAGE_KEYS.httpsRequired);
    }
  }

  if (isNotReadableMediaError(error)) {
    return translate(lang, "cm_ui_media_device_in_use");
  }

  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return translate(
      lang,
      kind === "video" ? "cm_ui_media_permission_video_site_settings" : "cm_ui_media_permission_voice_site_settings"
    );
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return translate(lang, kind === "video" ? "cm_ui_media_no_device_video" : "cm_ui_media_no_device_voice");
  }
  if (name === "AbortError") {
    return translate(lang, "cm_ui_media_abort_delay");
  }
  if (name === "OverconstrainedError") {
    return translate(
      lang,
      kind === "video" ? "cm_ui_media_overconstrained_video" : "cm_ui_media_overconstrained_voice"
    );
  }

  const detail = extractErrorDetail(error);
  if (detail) {
    return translate(
      lang,
      kind === "video" ? "cm_ui_media_error_video_with_detail" : "cm_ui_media_error_voice_with_detail",
      { detail }
    );
  }
  return translate(
    lang,
    kind === "video" ? "cm_ui_media_prepare_failed_video" : "cm_ui_media_prepare_failed_voice"
  );
}
