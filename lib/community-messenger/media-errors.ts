import type { CommunityMessengerCallKind } from "@/lib/community-messenger/types";

/** Agora join·publish 단계에서 네트워크·토큰 일시 오류 등 재시도할 만한 경우 */
export function isAgoraJoinRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const n = error.name;
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
  if (/token|invalid.*channel|network|timeout|unreachable|gateway|JOIN/i.test(msg)) return true;
  return false;
}

export function getCommunityMessengerMediaErrorMessage(
  error: unknown,
  kind: CommunityMessengerCallKind
): string {
  const name =
    typeof error === "object" && error && "name" in error
      ? String((error as { name?: unknown }).name ?? "")
      : "";

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
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "다른 앱이 장치를 사용 중일 수 있습니다. 장치 점유를 해제한 뒤 다시 시도해 주세요.";
  }
  if (name === "AbortError") {
    return "장치 연결이 잠시 지연되고 있습니다. 잠시 후 다시 시도해 주세요.";
  }
  if (name === "OverconstrainedError") {
    return kind === "video"
      ? "카메라 또는 마이크 설정을 맞추지 못했습니다. 다른 장치를 선택하거나 권한을 다시 확인해 주세요."
      : "마이크 설정을 맞추지 못했습니다. 다른 장치를 선택하거나 권한을 다시 확인해 주세요.";
  }
  return kind === "video"
    ? "영상 통화 장치 준비에 실패했습니다. 권한과 장치 상태를 확인해 주세요."
    : "음성 통화 장치 준비에 실패했습니다. 권한과 장치 상태를 확인해 주세요.";
}
